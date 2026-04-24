import { NextResponse } from 'next/server';
import { createRequire } from 'module';
import {
    buildDcLookupMap,
    buildProductSnapshotUpdate,
    enrichProductVariantsWithDcData,
    getDcFeedItems,
    getProductMatchCodes,
    mergeProductWithDcData
} from '@/lib/server/dc-firestore-snapshot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const require = createRequire(import.meta.url);
const { admin, getDb, verifyAdminRequest } = require('../../../../api/_firebaseAdmin');

const DEFAULT_DC_PRODUCTS_URL = 'https://glass-system-backend.onrender.com/public/products';
const DEFAULT_DC_STOCK_URL = 'https://glass-system-backend.onrender.com/public/stock';
const DC_UPSTREAM_TIMEOUT_MS = 10000;
const FIRESTORE_BATCH_LIMIT = 400;

async function fetchDcFeed(url, label, emptyFallback) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DC_UPSTREAM_TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                Accept: 'application/json'
            },
            signal: controller.signal,
            cache: 'no-store'
        });

        const payload = await response.text();
        let parsedPayload = emptyFallback;

        try {
            parsedPayload = payload ? JSON.parse(payload) : emptyFallback;
        } catch (_error) {
            parsedPayload = emptyFallback;
        }

        if (!response.ok) {
            const error = new Error((parsedPayload && parsedPayload.error) || `Failed to fetch ${label}`);
            error.status = response.status;
            throw error;
        }

        return parsedPayload;
    } catch (error) {
        if (error?.name === 'AbortError') {
            const timeoutError = new Error(`Timed out while fetching ${label}`);
            timeoutError.status = 504;
            throw timeoutError;
        }

        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}

async function commitBatchIfNeeded(batch, operationCount) {
    if (operationCount <= 0) {
        return;
    }

    await batch.commit();
}

export async function POST(request) {
    try {
        await verifyAdminRequest({
            headers: {
                authorization: request.headers.get('authorization') || ''
            }
        });

        const [productsPayload, stockPayload] = await Promise.all([
            fetchDcFeed(process.env.DC_PUBLIC_PRODUCTS_URL || DEFAULT_DC_PRODUCTS_URL, 'DC products feed', []),
            fetchDcFeed(process.env.DC_PUBLIC_STOCK_URL || DEFAULT_DC_STOCK_URL, 'DC stock feed', {})
        ]);

        const dcProductsMap = buildDcLookupMap(getDcFeedItems(productsPayload));
        const dcStockMap = buildDcLookupMap(getDcFeedItems(stockPayload));

        const db = getDb();
        const productsSnapshot = await db.collection('products').get();
        let batch = db.batch();
        let batchOperations = 0;
        let matchedCount = 0;
        let updatedCount = 0;

        for (const productDocument of productsSnapshot.docs) {
            const product = {
                id: productDocument.id,
                ...productDocument.data()
            };
            const productCodes = getProductMatchCodes(product);
            const dcProduct = productCodes.map((code) => dcProductsMap[code]).find(Boolean) || null;
            const dcStock = productCodes.map((code) => dcStockMap[code]).find(Boolean) || null;

            if (!dcProduct && !dcStock) {
                continue;
            }

            matchedCount += 1;

            const mergedProduct = enrichProductVariantsWithDcData(
                mergeProductWithDcData(product, dcProduct, dcStock),
                dcProductsMap,
                dcStockMap
            );

            const productUpdate = buildProductSnapshotUpdate(
                product,
                mergedProduct,
                admin.firestore.FieldValue.serverTimestamp()
            );

            if (!productUpdate) {
                continue;
            }

            batch.set(productDocument.ref, productUpdate, { merge: true });
            batchOperations += 1;
            updatedCount += 1;

            if (batchOperations >= FIRESTORE_BATCH_LIMIT) {
                await commitBatchIfNeeded(batch, batchOperations);
                batch = db.batch();
                batchOperations = 0;
            }
        }

        await commitBatchIfNeeded(batch, batchOperations);

        return NextResponse.json({
            success: true,
            matchedCount,
            updatedCount,
            productCount: productsSnapshot.size,
            syncedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('Failed to sync DC snapshot into Firestore:', error);

        return NextResponse.json({
            error: error?.message || 'Failed to sync DC snapshot into Firestore'
        }, {
            status: error?.status || 500
        });
    }
}