# Vercel Optimization Plan

Last updated: 2026-04-24
Owner: GitHub Copilot + Mohamed
Scope: Reduce Vercel Fluid CPU risk, improve deployment resilience, and track execution status.

## Working Rules

- This file is the source of truth for the current optimization work.
- After each meaningful implementation step, update the status and the execution log below.
- Prioritize the highest-impact runtime hotspots before larger refactors.

## Current Goal

Keep the project safely below the Vercel free-tier CPU limit by reducing unnecessary dynamic compute and preparing an emergency failover path.

## Execution Plan

### 1. Audit Vercel usage sources
Status: Completed
Goal: Identify which routes, user agents, or dashboards are causing the highest CPU usage.
Planned actions:
- Review Vercel Usage and Functions data in the dashboard.
- Confirm whether traffic is normal traffic, bots, or internal polling.
- Match dashboard findings to known runtime-heavy routes in this repo.

Audit checklist:
- Open the Vercel project Usage page for the production project.
- Record the time range where Fluid CPU increased sharply.
- Check which function paths or routes are consuming the most compute.
- Check whether the traffic is concentrated in one endpoint or spread across several endpoints.
- Inspect user-agent, geography, and request pattern clues to separate bots from expected traffic.
- Compare the top routes against known code hotspots in this repo before making changes.
- Write a short finding summary in this file before moving to implementation.

Findings summary:
- Production project `house-of-glass` is the active source of compute; staging remains effectively idle.
- In Vercel Observability over the last 6 hours, the project shows about 2.1K edge requests and 617 function invocations.
- Vercel Functions show about 58 seconds of Active CPU in the last 6 hours.
- The strongest warning signal is a 23.8% function timeout rate in the same period.
- Top function routes by Active CPU in the same period are:
	- `/api/dc/watch`: 35 invocations, 26s Active CPU, 100% error rate.
	- `/api/dc/stock`: 195 invocations, 11s Active CPU, 3.6% error rate.
	- `/api/dc/products`: 195 invocations, 10s Active CPU, 0.5% error rate.
	- `/product/[id]`: 68 invocations, 4.93s Active CPU, 0% error rate.
	- `/api/product-view`: 34 invocations, 2.95s Active CPU, 0% error rate.
- Edge requests are not the main problem. Top edge paths in the same period include `/api/dc/stock`, `/api/dc/products`, `/`, `/product/[id]`, and `/api/dc/watch`, and the cached column shows `/`, `/sw.js`, and `/logo.png` are served from cache rather than being the compute driver.
- The current evidence points to dynamic DC endpoints and streaming/polling behavior as the main CPU pressure source, not the storefront home page.
- `/api/dc/watch` is the highest-priority suspect because it combines SSE behavior with the highest Active CPU and a 100% error rate.

### 2. Reduce hot dynamic endpoints
Status: In progress
Goal: Lower compute from the most expensive dynamic handlers first.
Planned actions:
- Review `src/app/api/dc/watch/route.js` and reduce unnecessary polling pressure.
- Review runtime-heavy API routes such as server-status and live pricing.
- Add guardrails where possible, such as auth, throttling, caching, or slower refresh windows.

Progress update:
- Completed the first repair on the hottest endpoint path.
- `src/contexts/GalleryContext.jsx` now uses the existing fallback polling path by default on hosted environments, and only enables the DC watch stream locally or when explicitly enabled with `NEXT_PUBLIC_ENABLE_DC_WATCH_STREAM=true`.
- `src/app/api/dc/watch/route.js` now returns `204 No Content` when the stream is disabled, which prevents stale EventSource clients from keeping the hot SSE endpoint alive after deployment.
- This repair is designed to preserve the website UI and keep normal catalog sync behavior without relying on long-lived production SSE connections.
- Completed the second repair on the next two hottest DC endpoints.
- Storefront DC sync requests no longer add cache-busting query params or no-store headers by default during normal catalog sync.
- `src/app/api/dc/products/route.js` and `src/app/api/dc/stock/route.js` now use short shared caching for ordinary storefront reads, while explicit refresh flows such as `refresh=1`, `watch=1`, and `admin_live=1` still bypass cache and fetch live data.
- The cache window is intentionally short to avoid visible UI drift while still reducing repeated compute pressure on Vercel.

### 3. Throttle admin polling
Status: Completed
Goal: Reduce repeated background requests from admin and monitoring pages.
Planned actions:
- Review `src/app/server-status/page.js`.
- Review `src/app/cloud-server-status/page.js`.
- Review `src/app/whatsapp-server/page.js`.
- Increase refresh intervals and disable aggressive auto-refresh where it is not essential.

Progress update:
- `src/app/server-status/page.js` now skips polling while the tab is hidden and refreshes once when the tab becomes visible again.
- `src/app/cloud-server-status/page.js` now follows the same visibility-aware polling behavior.
- `src/app/whatsapp-server/page.js` now pauses dashboard and logs polling while hidden, then resumes cleanly on visibility return.
- These changes reduce background requests without changing the visible layout or the interactive behavior while the page is actively open.

### 4. Review static-friendly routes
Status: Completed
Goal: Convert routes to more cache-friendly behavior where possible in App Router.
Planned actions:
- Audit `force-dynamic` and `cache: 'no-store'` usage.
- Review pages that only need light URL param handling.
- Prefer static rendering or cached behavior when runtime data is not required.

Progress update:
- Reviewed the remaining function-heavy product share route after the DC endpoint fixes.
- `src/lib/server/product-share.js` now uses a short-lived Next data cache around the Firestore product-share lookup, reducing repeated database work for `/product/[id]` preview requests.
- The cache window is intentionally short so product share previews stay fresh while still lowering repeated compute pressure.
- No UI structure or redirect behavior was changed in the share page flow.

### 5. Prepare Netlify failover
Status: Not started
Goal: Keep a working backup deployment ready if Vercel pauses the project.
Planned actions:
- Create and verify a Netlify deployment.
- Confirm required environment variables and provider integrations.
- Prepare a short DNS cutover checklist.

## Known Hotspots

- `src/app/api/dc/watch/route.js`: SSE watcher with external polling every 5 seconds while clients are connected.
- `src/app/api/server-status/route.js`: live backend work against Postgres per request.
- `src/app/api/integrations/sideup/pricing/route.js`: live rate lookup on demand.
- Admin monitoring pages use frequent auto-refresh and may multiply load when tabs remain open.

## Execution Log

- 2026-04-22: Created this tracking file and recorded the initial optimization plan.
- 2026-04-22: Initial code audit suggests the biggest CPU risk is dynamic APIs and polling, not classic SSR-to-SSG migration.
- 2026-04-22: Started the Vercel usage audit phase and expanded it into a concrete checklist for the first investigation pass.
- 2026-04-22: Attempted to open the Vercel dashboard from the current workspace browser context; the session is not authenticated yet, so live usage inspection is temporarily blocked until login or screenshots are provided.
- 2026-04-22: Completed the first live Vercel audit pass after login. Observability shows the main risk is function timeouts and dynamic DC endpoints, led by `/api/dc/watch`, `/api/dc/stock`, and `/api/dc/products`.
- 2026-04-22: Implemented the first clean repair for the DC watch path. Hosted environments now default to fallback sync instead of public SSE streaming, and the route itself short-circuits with `204` when watch streaming is disabled.
- 2026-04-22: Implemented the second clean repair for DC feed pressure. Normal storefront sync now allows short cache reuse, while manual refresh, admin views, and watch-triggered sync still bypass cache.
- 2026-04-22: Completed the admin polling throttle pass by pausing status and WhatsApp dashboard polling in hidden tabs and refreshing once on visibility return.
- 2026-04-22: Added a short-lived cache for shared product metadata reads so `/product/[id]` preview requests do not hit Firestore on every request.
- 2026-04-22: Verified a clean production build locally with `next build` before deployment.
- 2026-04-22: Production deploy started at `2026-04-22 22:58:02 +02:00`.
- 2026-04-22: Production deploy completed at `2026-04-22 22:59:21 +02:00` and was aliased successfully to `https://www.hg-alshour.online`.
- 2026-04-22: Vercel inspect URL for this deploy: `https://vercel.com/hadys-projects-95c1687c/house-of-glass/ATpcP74qiErgaoRoiDvQXbKBjP73`.
- 2026-04-22: Direct production deployment URL for this deploy: `https://house-of-glass-10dne474i-hadys-projects-95c1687c.vercel.app`.
- 2026-04-22: Post-deploy smoke check confirmed the production homepage opens on `https://www.hg-alshour.online/`.
- 2026-04-23: Completed the first one-hour post-deploy Vercel review. The strongest improvement is that function timeouts dropped from `23.8%` in the earlier audit window to `0%` in the last-hour window.
- 2026-04-23: In the first one-hour post-deploy window, `/api/dc/watch` no longer appears among the top Vercel function routes.
- 2026-04-23: In the first one-hour post-deploy window, `/api/dc/stock` shows `10` invocations and `1.73s` Active CPU with `0%` error rate, while `/api/dc/products` shows `10` invocations and `1.55s` Active CPU with `0%` error rate.
- 2026-04-23: In the first one-hour post-deploy window, `/product/[id]` shows `4` invocations and `1.55s` Active CPU with `0%` error rate.
- 2026-04-23: Edge Requests for the first post-deploy hour show `/api/dc/products` at `10` requests with `10%` cached and `/api/dc/stock` at `9` requests with `22.2%` cached, while the storefront shell `/` remains `100%` cached.
- 2026-04-24: Added a clean admin freshness repair in `src/app/admin/products/page.js`. The admin products screen now requests a live DC refresh only when the visible page is working with a stale snapshot, and it also forces a debounced live refresh for direct code/barcode searches without changing storefront modal behavior or adding continuous polling.
- 2026-04-24: Added an admin-only Firestore baseline sync route at `src/app/api/dc/snapshot-sync/route.js`. Admin refreshes now persist the latest merged DC price and stock snapshot into the `products` collection so future reloads start from the newest known baseline instead of older Firestore values.

## One-Hour Post-Deploy Check

- Review time: `2026-04-23 00:00:17 +02:00`
- Window reviewed: last hour after the deployment completed at `2026-04-22 22:59:21 +02:00`
- Vercel Functions summary in this window: `Error 0%`, `Timeout 0%`
- Top Vercel function routes in this window:
	- `/api/dc/stock`: `10` invocations, `1.73s` Active CPU, `0%` error rate
	- `/product/[id]`: `4` invocations, `1.55s` Active CPU, `0%` error rate
	- `/api/dc/products`: `10` invocations, `1.55s` Active CPU, `0%` error rate
	- `/checkout`: `5` invocations, `1.01s` Active CPU, `0%` error rate
	- `/api/product-view`: `6` invocations, `440ms` Active CPU, `0%` error rate
	- `/api/notifications/push-subscription`: `8` invocations, `370ms` Active CPU, `0%` error rate
	- `/api/integrations/sideup/locations`: `3` invocations, `175ms` Active CPU, `0%` error rate
	- `/api/integrations/sideup/pricing`: `4` invocations, `100ms` Active CPU, `0%` error rate
- Important comparison against the pre-deploy audit:
	- Function timeout rate improved from `23.8%` to `0%`.
	- `/api/dc/watch` dropped out of the top function list entirely after the repair.
	- `/api/dc/stock` and `/api/dc/products` remain active, but at much smaller last-hour volumes and with `0%` error rate in the observed window.

## Follow-Up Quick Check

- Follow-up review result: the improvement still appears stable.
- Latest quick Vercel Functions check shows `Error 0%` and `Timeout 0%`.
- In this quick check window, `/api/dc/products` appears only once with `283ms` Active CPU and `/api/dc/stock` appears only once with `93ms` Active CPU.
- `/api/dc/watch` still does not appear among the top function routes.
- Edge Requests in the same quick check window are led by `/api/imagekit-auth` and `/api/notifications/push-subscription`, while `/` and static assets remain fully cached.

## Deploy Baseline

- Deploy start: `2026-04-22 22:58:02 +02:00`
- Deploy complete: `2026-04-22 22:59:21 +02:00`
- Compare Vercel Observability against traffic and function behavior after `2026-04-22 22:59:21 +02:00`.
- Suggested first review window: `2026-04-22 23:59:21 +02:00` or later.
- Inspect URL: `https://vercel.com/hadys-projects-95c1687c/house-of-glass/ATpcP74qiErgaoRoiDvQXbKBjP73`
- Production alias: `https://www.hg-alshour.online`
- Direct deployment URL: `https://house-of-glass-10dne474i-hadys-projects-95c1687c.vercel.app`

## Next Action

After `2026-04-22 23:59:21 +02:00`, reopen Vercel Observability and compare function activity and timeouts against the period starting from this deployment.