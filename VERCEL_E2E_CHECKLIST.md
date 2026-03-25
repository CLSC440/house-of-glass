# Vercel End-to-End Checklist

Use this checklist after any Vercel deployment or environment-variable change.

## 1. Environment Readiness

Confirm these Vercel environment variables exist before testing:

- `FIREBASE_SERVICE_ACCOUNT`
- `IMAGEKIT_PRIVATE_KEY`
- `IMAGEKIT_PUBLIC_KEY`
- `IMAGEKIT_URL_ENDPOINT`
- `DC_ONLINE_INVOICE_API_KEY`
- `DC_ONLINE_INVOICE_URL`
- `DC_PUBLIC_PRODUCTS_URL`
- `DC_PUBLIC_STOCK_URL`
- `SERVER_STATUS_DATABASE_URL` or `DATABASE_URL`
- `SERVER_STATUS_DATABASE_SSL`
- `LOCAL_SERVER_STATUS_URL`

Expected result:
- All required variables are present in the Vercel project.
- A fresh redeploy has been triggered after any variable change.

## 2. Base Site Check

Open the production domain and verify:

1. Home page loads.
2. Login page loads.
3. Admin page loads after authentication.
4. Browser console has no new blocking errors.

Expected result:
- Static pages render normally.
- No broken routing after moving to Vercel-first runtime.

## 3. DC Products Proxy Check

Open this route in the browser or an API client:

`/api/dc/products`

Verify:

1. Response is JSON.
2. Response contains product items from the DC feed.
3. No HTML error page is returned.

Expected result:
- HTTP 200.
- JSON array is returned.
- Data shape matches what pricing code expects.

Failure points:
- `DC_PUBLIC_PRODUCTS_URL` missing.
- DC server unavailable.
- DC response changed shape.

## 4. DC Stock Proxy Check

Open this route:

`/api/dc/stock`

Verify:

1. Response is JSON.
2. Response contains `products` or the expected stock payload.
3. No timeout or gateway error.

Expected result:
- HTTP 200.
- JSON payload includes stock records.

Failure points:
- `DC_PUBLIC_STOCK_URL` missing.
- DC stock endpoint unavailable.
- Upstream payload format changed.

## 5. Frontend Pricing Check

On the gallery home page:

1. Wait for products to render.
2. Confirm price badges populate.
3. Confirm unmatched products show a fallback state like `N/A` instead of crashing.

Expected result:
- Product cards update from live DC pricing.
- No direct browser call to the old DC host is required.

Related code paths:
- `index.html` live pricing flow
- `/api/dc/products`

## 6. Frontend Stock Check

On the gallery home page:

1. Check that out-of-stock overlays reflect DC stock.
2. Confirm add-to-cart hides for items with unavailable retail stock.
3. Confirm stock refresh still works after page stays open.

Expected result:
- Stock-linked products reflect showroom and warehouse availability correctly.
- Polling does not break page behavior.

Related code paths:
- `index.html` stock sync flow
- `/api/dc/stock`

## 7. Admin Pricing Check

On the admin page:

1. Open product edit or variant edit.
2. Enter a known barcode/code.
3. Confirm retail, wholesale, and discount values appear.

Expected result:
- Admin pricing helpers resolve through `/api/dc/products`.
- Missing links show a controlled `Not linked` state.

## 8. Admin Stock Dashboard Check

Open `admin-stock.html`.

Verify:

1. Table loads without a manual endpoint change.
2. Retail stock and warehouse stock values appear.
3. Search and filter still work.
4. Linked/unlinked states look correct.

Expected result:
- Stock dashboard reads through `/api/dc/stock`.
- No direct browser dependency on the old DC host remains.

## 9. Local Server Status Check

Open `server-status.html`.

Verify:

1. Page loads.
2. Local status data appears when `LOCAL_SERVER_STATUS_URL` is reachable.
3. If unreachable, the page shows a controlled error state instead of hanging.

Expected result:
- Vercel proxy reaches the configured local server endpoint.
- Clear error state appears if the upstream is offline.

## 10. Cloud Server Status Check

Open `cloud-server-status.html`.

Verify:

1. CPU, RAM, and disk values load.
2. Last-updated timestamp appears.
3. Error state is readable if DB connectivity fails.

Expected result:
- `/api/server-status` returns data from the configured database.

## 11. Account API Check

Test these account flows:

1. Login.
2. Signup.
3. Username/phone availability checks.
4. Profile update.

Expected result:
- `/api/user-account` works on Vercel.
- No auth-related regression after deployment changes.

## 12. Media API Check

Test these media flows:

1. Upload an image from admin.
2. Delete an old image from admin.
3. Request product media by code using `/api/media?code=...`.

Expected result:
- ImageKit auth works.
- ImageKit delete works.
- Public media response still serves HG/DC integration needs.

## 13. Invoice Push Check

Use a test order and verify the manual send-to-DC path from admin.

Steps:

1. Create or locate a valid order with item codes present.
2. Open admin orders.
3. Trigger `Send To DC` or retry from the order card.
4. Watch the order status badge.
5. Check the saved `dcSync` data in Firestore.

Expected result:
- Request hits `/api/integrations/online-invoices`.
- DC receives payload with `externalOrderId`, `orderType`, customer data, notes, and grouped item codes.
- Firestore order document updates `dcSync.status` to `success` or `failed` with a message.

Failure points:
- Missing `DC_ONLINE_INVOICE_URL`
- Missing `DC_ONLINE_INVOICE_API_KEY`
- Missing product codes on one or more order items
- DC endpoint rejected payload

## 14. Firestore Verification After Invoice Test

For the tested order, confirm:

1. `dcSync.status` exists.
2. `dcSync.message` is populated.
3. `dcSync.externalOrderId` is saved.
4. `dcSync.dcInvoiceId` is present on success.

Expected result:
- Order keeps a clear audit trail for the last DC sync attempt.

## 15. Regression Summary Before Sign-Off

Do not sign off the deploy until all of the following are true:

1. Products endpoint works.
2. Stock endpoint works.
3. Gallery prices render.
4. Gallery stock state renders.
5. Admin stock page works.
6. Local status page works or fails cleanly.
7. Cloud status page works or fails cleanly.
8. Invoice push succeeds for at least one test order.

## Quick Triage Map

If pricing is broken:
- Check `/api/dc/products`

If stock is broken:
- Check `/api/dc/stock`

If invoice push is broken:
- Check `/api/integrations/online-invoices`
- Check Firestore `orders/{id}.dcSync`

If local server page is broken:
- Check `/api/local-server-status`
- Check `LOCAL_SERVER_STATUS_URL`

If cloud status is broken:
- Check `/api/server-status`
- Check DB environment variables