# House of Glass

Gallery storefront and admin dashboard for Al Ashour Ades Showroom.

## Runtime Model
- Frontend pages are static HTML files served by Vercel.
- Server-side logic runs through Vercel Serverless Functions in `api/`.
- Firebase is used for auth and shared application data.
- ImageKit is the active media provider.
- DC system APIs remain the source of truth for prices, stock, and invoice submission.

## Important Integrations
- `api/integrations/online-invoices.js`: sends invoices to the DC system.
- DC pricing and stock are expected to come from the DC-side API using product codes.
- `api/media.js`: exposes product media to external systems.
- `api/local-server-status.js`: Vercel proxy for the local server metrics endpoint.
- `api/server-status.js`: AWS/database-backed cloud status endpoint.

## Local Development
Use Vercel locally when you need the website and `/api/*` endpoints together:

```bash
npm run dev
```

For a static-only preview without serverless functions:

```bash
npm run preview:static
```

## Vercel Deployment Workflow
1. Push the repository to GitHub.
2. Import the repository into Vercel.
3. Set the required environment variables in the Vercel project.
4. Redeploy after any environment variable change.

## Required Vercel Environment Variables
- `FIREBASE_SERVICE_ACCOUNT`
- `IMAGEKIT_PRIVATE_KEY`
- `IMAGEKIT_PUBLIC_KEY`
- `IMAGEKIT_URL_ENDPOINT`
- `DC_ONLINE_INVOICE_API_KEY`
- `DC_ONLINE_INVOICE_URL`
- `DC_PUBLIC_PRODUCTS_URL`
- `DC_PUBLIC_STOCK_URL`
- `SERVER_STATUS_DATABASE_PRIMARY_URL`
- `SERVER_STATUS_DATABASE_FALLBACK_URL`
- `SERVER_STATUS_DATABASE_SSL`
- `LOCAL_SERVER_STATUS_URL`

## Firebase Rules
- Firestore rules are kept in `firestore.rules`.
- Deploy rules with `firebase deploy --only firestore:rules`.
- Firebase is not used here as a hosting target anymore.

## Operational Notes
- Do not commit `.env.local` or service account JSON files.
- Rotate any credentials that were previously committed or shared in source code.
- The local server status page now uses a Vercel proxy instead of a hardcoded LAN IP.
- The DC invoice API is environment-driven and should remain configured in Vercel settings.

## Deployment Validation
- Use `VERCEL_E2E_CHECKLIST.md` after every production deploy or environment-variable change.