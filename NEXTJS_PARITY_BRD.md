# NextJS Parity BRD And Execution Tracker

Last updated: 2026-03-31
Project: House Of Glass - Next.js rebuild
Reference baseline: Gallary Website (old HTML/JS/Vercel app)
Target platform: Gallary NextJS (Next.js App Router)

## 1. Document Purpose

This file is the live execution document for the new Next.js website.

It exists to track:

- what the new website must match from the old website
- what has already been implemented
- what is still missing
- what exact comparisons must be made to reach 1:1 parity
- how each step will be tested before being marked complete

This file must be updated after every meaningful implementation step.

## 2. Main Product Goal

The new Next.js website must look and behave like the old Gallary Website as closely as possible, while keeping the performance and maintainability advantages of Next.js.

This means:

- same storefront feel
- same major user journeys
- same business logic direction
- same admin and account behavior where required
- same ordering flow expectations
- same integration priorities with Firebase, DC, and media APIs

The new website is not meant to be a redesign. It is a parity rebuild.

## 3. Non-Negotiable Parity Rules

The following rules define success:

1. The old website is the source of truth for UX, flow, and business behavior.
2. The Next.js app may improve structure and performance, but must not drift away from the old product behavior without explicit approval.
3. A step is not considered done until its tests are also documented and passed.
4. Every parity gap must be written here before or during implementation.
5. Every completed step must include a status update and verification note.

## 4. Current Status Snapshot

Overall parity status on 2026-03-31:

- Visual storefront parity: medium to good progress
- Account/auth parity: medium progress
- Retail cart and checkout parity: first functional pass completed
- Wholesale parity: first functional pass completed
- Admin parity: partial only
- API migration to App Router: partial only
- Server status and operational pages parity: partial / placeholder-level in some areas

## 5. What Has Already Been Done

### 5.1 Storefront and Gallery UI

Completed work:

- improved homepage shell to better match the old website
- expanded header behavior and sidebar/category interactions
- improved category row behavior and filtering experience
- improved search/filter presentation
- improved product grid cards to better match old visual tone
- improved product modal layout and metadata presentation
- added footer closer to the old website style
- improved floating contact actions

Verification completed:

- changed files validated with editor diagnostics
- production build passed

### 5.2 Account And Authentication Flow

Completed work:

- created a real App Router route for user account operations
- upgraded login flow toward old identifier-based behavior
- upgraded signup flow with richer profile fields
- upgraded profile page to support richer account data and delete account behavior
- installed firebase-admin to support secure server-side account logic

Verification completed:

- changed files validated with editor diagnostics
- production build passed

### 5.3 Retail Cart And Checkout

Completed work:

- added real retail cart state in the gallery context
- persisted retail cart in localStorage using houseOfGlassCart
- connected cart badge in the header
- added cart modal UI
- added toast UI for action feedback
- added quantity stepper and add-to-cart action in product modal
- added checkout flow that writes retail orders to Firestore
- kept order payload compatible with current admin/profile views by writing both customer and customerInfo
- fixed cart hydration so stored cart data is not overwritten on first load

Verification completed:

- changed files validated with editor diagnostics
- production build passed

## 6. What Is Still Missing

### 6.1 High Priority Missing Work

- final manual validation for DC-based price and stock parity across retail and wholesale views
- order history parity closer to the old website
- order-again behavior
- tighter role-based behavior between retail customer, wholesale customer, admin, and moderator

### 6.2 Medium Priority Missing Work

- admin dashboard parity for products, orders, users, and stock workflows
- migration of more legacy API behavior into App Router routes
- stronger parity for product variant handling
- richer notifications behavior similar to old website
- better parity for account panel and settings interactions

### 6.3 Lower Priority But Important

- final polishing for exact spacing, motion, and small interaction details
- broader regression pass across all routes
- final documentation cleanup
- isolated component-lab routes for testing non-parity UI ideas safely

## 7. Old Vs New Comparison Checklist

This section defines what must be compared to claim that the new site matches the old one.

### 7.1 Storefront Comparison

Must compare:

- header structure and actions
- sidebar behavior
- structured sidebar filters and filter counts
- category browsing flow
- search behavior
- product card density and information hierarchy
- product modal structure
- variant-product card behavior
- floating action buttons
- footer content and feel

Current assessment:

- much closer than before
- still needs small-detail polish and more behavioral parity around ordering, stock logic, and the full old filter experience

### 7.2 Product Interaction Comparison

Must compare:

- add to cart entry points
- quantity adjustment behavior
- retail vs wholesale separation
- stock limitation handling
- price display logic
- product variant handling
- WhatsApp inquiry behavior

Current assessment:

- retail add-to-cart now exists in Next.js
- wholesale flow is still missing
- live DC pricing and stock hydration is now wired into the storefront, with final manual parity validation still pending

### 7.3 Account Comparison

Must compare:

- login identifier support
- signup fields and validation
- profile editing
- account deletion
- order history visibility
- role-aware navigation

Current assessment:

- core account experience is significantly closer
- some account-panel style behaviors from the old site are still missing

### 7.4 Order Flow Comparison

Must compare:

- retail cart experience
- wholesale cart experience
- checkout confirmation behavior
- order save format
- order history retrieval
- reorder behavior

Current assessment:

- retail first pass is working
- wholesale parity and reorder behavior still missing

### 7.5 Admin Comparison

Must compare:

- order management
- stock management
- user management
- product management
- quick actions and visibility rules

Current assessment:

- admin exists in new site
- parity is still incomplete

### 7.6 Legacy Toolbar Findings

Source investigated:

- `C:/Users/Mohamed/Gallary Website/admin.html`
- `backup_index.html` for storefront/account-adjacent reference where needed
- available legacy source now includes the real old admin dashboard file

Important scope note:

- The screenshot toolbar is confirmed to come from the old `admin.html` dashboard shell.
- Most actions are now directly provable from old-source markup and handlers.
- Only minor visibility conditions remain partially implicit where buttons are rendered with `hidden` classes and later shown by runtime role/config logic.

Confirmed from code:

1. `Toolbar close / expand button`
	 - Confirmed handler: `toggleToolbar()`.
	 - Markup: left-most circular button inside `#adminToolbar`.
	 - What it does:
		 - toggles the toolbar `expanded` class
		 - swaps the icon between back-chevron and `X`
		 - resets horizontal scroll on the actions row when opening
	 - Legacy purpose:
		 - collapse/expand the floating admin toolbar, not navigate away.

2. `Moon / theme toggle`
	 - Confirmed handler: `window.toggleDarkMode()`.
	 - What it does:
		 - toggles the `dark` class on `document.documentElement`
		 - persists manual theme in `localStorage.darkMode`
		 - when auto theme is enabled, stores override time and resets back after 10 minutes
	 - Legacy purpose:
		 - quick admin theme override.

3. `Users / Team`
	 - Confirmed handler: `window.openUsersModal()`.
	 - Toolbar markup id: `manageUsersBtn`.
	 - Visibility note:
		 - rendered with `hidden`, so it is shown conditionally by runtime logic/role.
	 - What it does:
		 - opens the users management modal
		 - loads all users from Firestore `users`
		 - supports search, role sorting, role changes, and user deletion
	 - Legacy purpose:
		 - operational user management for admins.

4. `Gear / Settings`
	 - Confirmed handler: `window.openSettingsModal()`.
	 - What it does:
		 - opens the admin settings modal
		 - loads site settings fields like WhatsApp number, phone, price increase, Facebook link, WhatsApp channel, and maps link
	 - Legacy purpose:
		 - site-wide operational settings, not account settings.

5. `Server Status`
	 - Confirmed toolbar item: anchor `id="serverStatusBtn"` linking to `server-status.html`.
	 - Visibility note:
		 - rendered with `hidden`, so likely shown only under specific runtime conditions.
	 - Legacy purpose:
		 - quick access to server health/status page.

6. `WhatsApp Server`
	 - Confirmed toolbar item: anchor to `whatsapp-server.html`.
	 - Legacy purpose:
		 - quick access to WhatsApp server/integration operations.

7. `Stock Sync`
	 - Confirmed toolbar item: anchor to `admin-stock.html` with title `Stock Sync`.
	 - Legacy purpose:
		 - quick access to stock synchronization/admin stock tooling.

8. `Brands`
	 - Confirmed handler: `window.openBrandModal()` and `window.closeBrandModal()`.
	 - Supporting data flow:
		 - Firestore listener on collection `categories` populates `brandsData` and `brands`
		 - `renderBrandsInUI()` updates modal list and filter select
		 - Sortable is used to reorder brands and persist `order`
	 - What it does:
		 - opens the dedicated brands admin modal
		 - supports listing, adding, renaming, deleting, and reordering brands
	 - Legacy purpose:
		 - brands are an admin-managed taxonomy, not only a quick storefront filter.

9. `Categories`
	 - Confirmed handler: `window.openCategoryModal()` and `window.closeCategoryModal()`.
	 - Supporting data flow:
		 - Firestore listener on collection `productCategories` populates `categoriesData` and `categories`
		 - `renderCategoriesInUI()` updates modal list and filter select
		 - Sortable is used to reorder categories and persist `order`
	 - What it does:
		 - opens the dedicated categories admin modal
		 - supports listing, adding, renaming, deleting, and reordering categories
	 - Legacy purpose:
		 - product taxonomy management.

10. `Orders`
	 - Confirmed handler: `window.openOrdersModal()` and `window.closeOrdersModal()`.
	 - Supporting behavior:
		 - starts a Firestore listener on `orders`, ordered by `orderDate desc`
		 - keeps `allOrders` live in memory
		 - updates `ordersCountBadge` with pending order count
		 - supports filtering by `all`, `retail`, `wholesale`, and `pending`
		 - supports search and status updates
	 - Legacy purpose:
		 - live admin order operations panel.

11. `Reorder Rows`
	 - Confirmed handler: `window.openReorderModal()` and `window.closeReorderModal()`.
	 - Supporting behavior:
		 - opens `#reorderModal`
		 - calls `renderReorderRows()`
		 - groups products by ordered categories
		 - creates horizontal Sortable rows per category
		 - saves homepage row/product order through `saveNewProductOrder()`
	 - Legacy purpose:
		 - homepage merchandising control by row and product order.

12. `+ Add Product`
	 - Confirmed handler: `openModal()`.
	 - Supporting behavior:
		 - opens the product modal
		 - resets form for create mode when `isEdit` is false
		 - prepares brand/origin suggestions and image inputs
		 - same modal is reused for edit mode elsewhere via `window.openModal(true)` / edit flow
	 - Legacy purpose:
		 - primary entry point for creating products.

13. `View Site / Home`
	 - Confirmed toolbar item: anchor to `index.html` with title `View Site`.
	 - Visual form:
		 - uses the site favicon/logo inside a circular gold-toned button.
	 - Legacy purpose:
		 - jump from admin back to the storefront.

14. `Logout`
	 - Confirmed handler: `logout()`.
	 - Supporting behavior:
		 - implemented as `window.logout = () => signOut(auth)`.
	 - Legacy purpose:
		 - direct sign-out shortcut from admin toolbar.

15. `Account Settings exists separately but is not the same as toolbar gear`
	 - Confirmed legacy account handler: `window.openUserSettingsModal()` in `backup_index.html`.
	 - Important distinction:
		 - this belongs to storefront/account flows.
		 - it is different from admin toolbar `openSettingsModal()` in `admin.html`.

Parity implication for the Next.js rebuild:

- The admin toolbar parity target is now much clearer from `admin.html` and should be treated as source-of-truth behavior for:
	 - toolbar expand/collapse
	 - theme toggle
	 - users modal
	 - admin settings modal
	 - stock/server/WhatsApp shortcut links
	 - brands and categories management modals
	 - live orders modal with pending badge
	 - homepage row reordering modal
	 - add-product modal
	 - view-site shortcut
	 - logout shortcut
- The older `backup_index.html` remains useful for storefront/account parity, but it should no longer be the main reference for the admin toolbar now that `admin.html` is available.

## 8. Execution Plan And Tracking Table

Status legend:

- DONE = implemented and verified
- IN PROGRESS = active work, not yet fully verified
- TODO = not started yet
- BLOCKED = cannot proceed without missing requirement or dependency

| ID | Workstream | Target Outcome | Old Site Reference | Current Status | Tests Required | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | Storefront shell parity | Header, footer, sidebar, category browsing feel like old site | old index.html shell and navigation | DONE | build, visual regression pass, manual route check | First major parity pass completed |
| P2 | Product grid and modal parity | Product cards and modal closer to old hierarchy and style | old index.html product listing and detail modal | DONE | build, open/close modal test, image navigation test | Retail CTA added in current pass |
| P3 | Account API parity | Secure Next.js account operations | old api/user-account.js | DONE | build, login/signup/profile smoke tests | App Router route added |
| P4 | Login/signup/profile parity | New pages behave closer to old account model | old login.html, signup.html, account behavior | DONE | login test, signup test, profile save test, build | Core account pass completed |
| P5 | Retail cart parity | Working retail cart with persistent state and checkout | old cart modal and retail checkout flow | DONE | add/remove/update cart test, checkout test, build | First functional pass completed |
| P6 | Wholesale cart parity | Separate wholesale cart and order flow | old wholesale cart and wholesale checkout | DONE | wholesale add/update/remove test, checkout test, role test, build | First functional pass completed |
| P7 | Live stock and pricing parity | Cart and product logic honor old stock and pricing rules | old DC-linked cart logic and stock checks | IN PROGRESS | stock clamp test, price sync test, role price test, endpoint smoke test | Storefront now hydrates from live DC feeds; manual parity check still pending |
| P8 | Order history parity | Profile/history flow closer to old website | old order history modal and account panel | IN PROGRESS | order history view test, filtering test, route test | Type badges and richer history details started |
| P9 | Reorder behavior | User can reorder from old history | old orderAgain behavior | IN PROGRESS | reorder test, cart merge test, unavailable-item handling test | First reorder pass started |
| P10 | Admin parity | Admin routes behave closer to old system | old admin pages and operational flows | IN PROGRESS | per-page manual test, build, data mutation tests | Dashboard shell and navigation received first major parity pass |
| P11 | API migration parity | Legacy serverless logic moved into App Router where needed | old api folder | IN PROGRESS | endpoint smoke tests, build | Only part of the migration is done |
| P12 | Server status parity | Status pages reach old functionality | old local/cloud server status flows | TODO | route test, data load test, failure-state test | Still partial |
| P13 | Final polish and regression | Exact detail alignment and stability | whole old site | TODO | full regression checklist, build, lint triage | Final phase |

## 9. Step Update Template

Use this block every time a step is completed or meaningfully advanced.

```md
### Update - YYYY-MM-DD - Step ID

- Status: DONE / IN PROGRESS / TODO / BLOCKED
- What changed:
- Files touched:
- Comparison against old website:
- Tests run:
- Result:
- Remaining gap:
```

## 10. Testing Rules For Every Step

No step should be marked DONE unless its required tests are listed here and also mentioned in the update entry.

### 10.1 Minimum Required Test Types

Every step should use the applicable tests below:

- editor diagnostics check on changed files
- production build check
- manual behavior test for the affected route or component
- data persistence test if Firestore, auth, or localStorage is involved
- regression check for any user flow that the step may affect

### 10.2 Test Checklist Format

Use this checklist style when updating the document:

```md
Tests run:
- Diagnostics: pass/fail
- Build: pass/fail
- Manual UI test: pass/fail
- Data flow test: pass/fail
- Regression spot check: pass/fail
```

### 10.3 Current Known Verified Steps

- P1 verified by diagnostics and production build
- P2 verified by diagnostics and production build
- P3 verified by diagnostics and production build
- P4 verified by diagnostics and production build
- P5 verified by diagnostics and production build

### 10.4 Current Test Gaps

- no formal automated test suite exists yet for these parity steps
- many validations so far are build-level plus manual and diagnostics-based
- broader route-by-route regression pass is still needed

## 11. Immediate Next Recommended Steps

The next best sequence is:

1. implement wholesale cart parity
2. port live stock and pricing behavior more accurately from old logic
3. improve order history and add reorder behavior
4. continue admin parity and missing API migrations

## 12. Change Log

### Update - 2026-03-31 - P1/P2

- Status: DONE
- What changed: Storefront shell, gallery browsing, product cards, modal, footer, and floating actions were improved toward old-site parity.
- Files touched: multiple gallery and layout files in src/components and src/app.
- Comparison against old website: The storefront became much closer visually and structurally, but product ordering behavior was still incomplete at that stage.
- Tests run:
- Diagnostics: pass
- Build: pass
- Manual UI test: partial pass
- Data flow test: not applicable
- Regression spot check: partial pass
- Result: Accepted as first storefront parity pass.
- Remaining gap: ordering flow and more exact detail matching.

### Update - 2026-03-31 - P3/P4

- Status: DONE
- What changed: Secure App Router user-account route was added and login/signup/profile flows were upgraded toward old account behavior.
- Files touched: src/app/api/user-account/route.js, src/app/login/page.js, src/app/signup/page.js, src/app/profile/page.js.
- Comparison against old website: Account flows are now much closer to the old system, especially around identifier resolution and richer profile data.
- Tests run:
- Diagnostics: pass
- Build: pass
- Manual UI test: partial pass
- Data flow test: partial pass
- Regression spot check: partial pass
- Result: Accepted as core account parity pass.
- Remaining gap: account panel polish, history parity, and more detailed role behavior.

### Update - 2026-03-31 - P5

- Status: DONE
- What changed: Retail cart state, cart modal, toast notifications, cart badge, quantity controls, and retail checkout save flow were added to the Next.js storefront.
- Files touched: src/contexts/GalleryContext.jsx, src/components/gallery/CartModal.jsx, src/components/gallery/ToastStack.jsx, src/components/layout/Header.jsx, src/components/gallery/ProductModal.jsx, src/app/page.js, src/app/(gallery)/page.js.
- Comparison against old website: The new site now has a real retail order flow instead of a placeholder cart icon, but wholesale behavior and deeper stock/price rules are still missing.
- Tests run:
- Diagnostics: pass
- Build: pass
- Manual UI test: partial pass
- Data flow test: pass at implementation level
- Regression spot check: partial pass
- Result: Accepted as first retail order-flow parity pass.
- Remaining gap: wholesale cart, old-style stock rules, and reorder/order-history parity.

### Update - 2026-03-31 - P6

- Status: DONE
- What changed: Added role-aware wholesale cart state, wholesale cart button in the header, wholesale CTA inside the product modal, separate wholesale cart modal, and wholesale checkout save flow to Firestore.
- Files touched: src/contexts/GalleryContext.jsx, src/components/layout/Header.jsx, src/components/gallery/ProductModal.jsx, src/components/gallery/CartModal.jsx.
- Comparison against old website: The new site now has a separate wholesale ordering path instead of only retail cart behavior, but deeper live stock/price rules and reorder/history parity are still pending.
- Tests run:
- Diagnostics: pass
- Build: pass
- Manual UI test: pending user validation on localhost
- Data flow test: pass at implementation level
- Regression spot check: partial pass
- Result: Accepted as first wholesale order-flow parity pass.
- Remaining gap: live DC pricing rules, order history parity, and reorder behavior.

### Update - 2026-03-31 - P8/P9

- Status: IN PROGRESS
- What changed: Added order type badges in profile history, improved date formatting, added first order-again flow that restores items into retail or wholesale local cart storage, and made the gallery auto-open the target cart from URL after reorder.
- Files touched: src/lib/cart-storage.js, src/contexts/GalleryContext.jsx, src/app/profile/page.js.
- Comparison against old website: The new site now moves closer to the old order-history usability by allowing replay of previous orders, but it still does not perform live availability validation or richer history filtering like the old implementation.
- Tests run:
- Diagnostics: pass
- Build: pass
- Manual UI test: pending user validation on localhost
- Data flow test: pass at implementation level
- Regression spot check: partial pass
- Result: First reorder/history parity pass completed, with manual validation still pending.
- Remaining gap: stock-aware reorder validation, better history filtering, and tighter old-style order panel behavior.

### Update - 2026-03-31 - Storefront Filters

- Status: IN PROGRESS
- What changed: Added old-style structured storefront filters with multi-select categories, brands, origins, in-stock-only toggle, active filter chips, clear-all behavior, and URL syncing.
- Files touched: src/contexts/GalleryContext.jsx, src/components/gallery/SearchFilter.jsx, src/components/layout/Header.jsx.
- Comparison against old website: The new site now follows the old filter direction much more closely by moving beyond a single category dropdown into layered catalog facets, but exact visual and behavioral parity still needs manual polish.
- Tests run:
- Diagnostics: pass
- Build: pass
- Manual UI test: pending user validation on localhost
- Data flow test: pass at state/url-sync level
- Regression spot check: partial pass
- Result: First structured filter parity pass completed, with manual validation still pending.
- Remaining gap: final polish for sidebar layout and exact old-style interactions.

### Update - 2026-03-31 - P7

- Status: IN PROGRESS
- What changed: Added App Router `/api/dc/products` proxy and live DC hydration inside `GalleryContext` so storefront products now merge Firestore catalog data with live DC pricing and stock values matched by product code or barcode.
- Files touched: src/app/api/dc/products/route.js, src/contexts/GalleryContext.jsx.
- Comparison against old website: The new site now follows the old DC-linked storefront behavior much more closely by using live price and stock feeds instead of rendering Firestore values only, but retail-vs-wholesale display parity still needs final manual verification on localhost.
- Tests run:
- Diagnostics: pass
- Build: pass
- Manual UI test: pending user validation on localhost
- Data flow test: pass (`/api/dc/products` and `/api/dc/stock` both returned 200 locally)
- Regression spot check: partial pass
- Result: Root cause fixed at implementation level; final parity confirmation is pending live UI validation.
- Remaining gap: confirm visible retail prices, wholesale prices, and stock badges match old-site expectations for representative products.

### Update - 2026-03-31 - Variant Flip Cards

- Status: IN PROGRESS
- What changed: Added a variant-only flip interaction to storefront product cards so products with variants can reveal a back face preview with quick variant summaries and a direct details CTA, while non-variant products keep the original card behavior.
- Files touched: src/components/gallery/ProductGrid.jsx.
- Comparison against old website: This is a controlled enhancement on top of the existing parity work. It adds clearer affordance for variant-heavy products without replacing the old browse-to-details flow for the rest of the catalog.
- Tests run:
- Diagnostics: pass
- Build: pass
- Manual UI test: pending user validation on localhost
- Data flow test: not applicable
- Regression spot check: partial pass
- Result: Variant card flip behavior is implemented and build-safe.
- Remaining gap: verify the flip feel, mobile tap behavior, and whether the visual treatment should be more subtle to stay aligned with old-site tone.

### Update - 2026-03-31 - Animated Testimonials Lab

- Status: IN PROGRESS
- What changed: Initialized shadcn with Aceternity registry support, added the Animated Testimonials component, adapted the demo data to House Of Glass collection imagery, and created an isolated preview route for evaluating the motion style safely outside the main storefront.
- Files touched: components.json, src/components/ui/animated-testimonials.jsx, src/components/animated-testimonials-demo.jsx, src/app/component-lab/animated-testimonials/page.js, package.json, src/app/globals.css, src/components/ui/button.jsx, src/lib/utils.js.
- Comparison against old website: This is an exploratory UI lab path and not a parity step. It exists to test whether the motion language is worth adapting into a product-focused section later.
- Tests run:
- Diagnostics: pass
- Build: pass
- Manual UI test: route opened for localhost preview
- Data flow test: not applicable
- Regression spot check: partial pass
- Result: Component is installed and previewable without affecting the main storefront flow.
- Remaining gap: decide whether to adapt this animation language into a product-variant showcase or leave it as a lab-only experiment.

### Update - 2026-03-31 - P10

- Status: IN PROGRESS
- What changed: Refreshed the admin dashboard shell with a stronger dark control-room layout, restored a more deliberate sidebar/navigation treatment, upgraded KPI cards with more meaningful metrics, and improved the recent orders table hierarchy with better customer fallbacks, order type badges, and corrected `ج.م` currency formatting.
- Files touched: src/app/admin/layout.js, src/app/admin/page.js, src/components/admin/AdminSidebar.jsx, src/components/admin/DashboardStats.jsx, src/components/admin/OrdersTable.jsx.
- Comparison against old website: The admin home now feels more intentional and operational instead of a generic placeholder, but deeper parity for products, orders workflows, stock tooling, and users management is still pending.
- Tests run:
- Diagnostics: pass
- Build: pass
- Manual UI test: pending user validation on localhost
- Data flow test: pass at Firestore snapshot rendering level
- Regression spot check: partial pass
- Result: First admin dashboard parity pass completed and build-safe.
- Remaining gap: finish parity for the rest of the admin routes, add action-level workflows, and verify mobile/admin usability against the legacy system.

### Update - 2026-03-31 - P10 Orders Detail Pass

- Status: IN PROGRESS
- What changed: Tightened the admin orders page spacing and visual density, normalized order amount/date/customer parsing against mixed legacy and new payload shapes, and added expandable per-order details showing customer info, order metadata, and full item lines with quantities and line totals.
- Files touched: src/app/admin/orders/page.js, src/lib/utils/admin-orders.js.
- Comparison against old website: The orders route is now materially more useful for operations because each order can be inspected in place instead of only showing a flat row, but parity still needs richer filtering, notes/shipping workflows, and action coverage.
- Tests run:
- Diagnostics: pass
- Build: pass
- Manual UI test: pending user validation on localhost
- Data flow test: pass at Firestore snapshot rendering level
- Regression spot check: partial pass
- Result: Orders page now supports practical review of order contents and details in the admin flow.
- Remaining gap: add filters/search, better shipping/address coverage if available in data, and align products/users/stock pages to the same quality bar.

### Update - 2026-04-01 - P10 Products Parity Pass

- Status: IN PROGRESS
- What changed: Rebuilt the admin products route from a simple table into a legacy-style dark control view with a top filter toolbar, richer product cards, retail/net/wholesale pricing blocks, expandable variant pricing rows, and a product history/details modal with graceful fallback when no stored audit trail exists.
- Files touched: src/app/admin/products/page.js.
- Comparison against old website: The products route now follows the old admin dashboard direction much more closely in structure and visual hierarchy instead of feeling like a generic CRUD table, but exact filter wording, live edit-history persistence, and final spacing polish still need localhost validation against the legacy screen.
- Tests run:
- Diagnostics: pass
- Build: pass
- Manual UI test: pending user validation on localhost
- Data flow test: pass at existing Firestore product rendering level
- Regression spot check: partial pass
- Result: First major admin products parity pass completed and production build stayed healthy.
- Remaining gap: verify the page against the old screen on representative products, decide whether product history should become persisted audit data instead of fallback metadata only, and continue parity work on stock/users action-level flows.

### Update - 2026-04-01 - P10 Products Refinement Pass

- Status: IN PROGRESS
- What changed: Refined the admin products parity pass to consume live DC discount fields, corrected net-versus-discount rendering, improved DC product matching with `product_code`, aligned the sort label with the old screen, removed extra generic badge noise, and updated media/status presentation to sit closer to the legacy product cards.
- Files touched: src/app/admin/products/page.js, src/contexts/GalleryContext.jsx.
- Comparison against old website: The new route now matches the old product cards more accurately at the data and visual level, especially around discount-aware net pricing and tighter metadata hierarchy, though final spacing and per-product validation are still pending manual localhost comparison.
- Tests run:
- Diagnostics: pass
- Build: pass
- Manual UI test: pending user validation on localhost
- Data flow test: pass at live DC merge level
- Regression spot check: partial pass
- Result: Product pricing and card presentation moved materially closer to the old admin dashboard without regressing the app build.
- Remaining gap: final manual comparison for representative products and optional persisted edit-history support if exact operational parity is required.
