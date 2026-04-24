import { NextResponse } from 'next/server';
import { createRequire } from 'module';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const require = createRequire(import.meta.url);
const { admin, getDb, verifyAdminRequest } = require('../../../../api/_firebaseAdmin.js');

const DEFAULT_DC_PRODUCTS_URL = 'https://glass-system-backend.onrender.com/public/products';
const DEFAULT_DC_STOCK_URL = 'https://glass-system-backend.onrender.com/public/stock';
const DC_REQUEST_TIMEOUT_MS = 10000;
const FIRESTORE_BATCH_LIMIT = 400;
const SYNCED_PRODUCT_FIELDS = [
    'matchedBarcode',
    'price',
    'retailPrice',
    'retail_price',
    'wholesalePrice',
    'wholesale_price',
    'cartonPrice',
    'discountAmount',
    'discount_amount',
    'discount',
    'remainingQuantity',
    'totalStock',
    'total_stock',
    'showroomStock',
    'retailStock',
    'warehouseStock',
    'wholesaleStock',
    'stock_by_warehouse',
    'stockByWarehouse',
    'stockStatus'
];

function parsePrice(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'string') return 0;

    const normalized = value.replace(/,/g, '').trim();
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeInventoryCode(value) {
    return String(value || '').trim().toLowerCase();
}

function getUniqueValues(values) {
    return Array.from(new Set(values.filter(Boolean)));
}

function getProductMatchCodes(product = {}) {
    return getUniqueValues([
        product.code,
        product.barcode,
        product.matchedBarcode,
        product.productCode,
        product.sku,
        product.itemCode
    ].map(normalizeInventoryCode));
}

function getDcItemMatchCodes(item = {}) {
    return getUniqueValues([
        item.barcode,
        item.code,
        item.product_code,
        item.productCode,
        item.sku,
        item.itemCode,
        item.id
    ].map(normalizeInventoryCode));
}

function getDcFeedItems(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.products)) return payload.products;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
}

function parseCount(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function normalizeWarehouseName(value) {
    return String(value || '').replace(/\s+/g, '');
}

function getWarehouseStockTotal(stockByWarehouse) {
    if (!Array.isArray(stockByWarehouse)) return null;

    const total = stockByWarehouse.reduce((sum, warehouseEntry) => {
        const quantity = Number(warehouseEntry?.quantity);
        return sum + (Number.isFinite(quantity) ? quantity : 0);
    }, 0);

    return Number.isFinite(total) ? total : null;
}

function getDcTotalStock(item = {}) {
    return parseCount(item.total_stock)
        ?? parseCount(item.totalStock)
        ?? parseCount(item.quantity)
        ?? getWarehouseStockTotal(item.stock_by_warehouse)
        ?? getWarehouseStockTotal(item.stockByWarehouse);
}

function getDcWarehouseBuckets(item = {}) {
    let showroomStock = 0;
    let warehouseStock = 0;

    (item.stock_by_warehouse || item.stockByWarehouse || []).forEach((warehouseEntry) => {
        const warehouseId = Number(warehouseEntry?.warehouse_id || warehouseEntry?.warehouseId || 0);
        const warehouseName = normalizeWarehouseName(warehouseEntry?.warehouse_name || warehouseEntry?.warehouseName);
        const quantity = Number(warehouseEntry?.quantity || 0);

        if (!Number.isFinite(quantity) || quantity <= 0) return;

        if (warehouseId === 1) {
            showroomStock += quantity;
            return;
        }

        if (warehouseId === 2) {
            warehouseStock += quantity;
            return;
        }

        if (!warehouseName) return;

        if (warehouseName.includes('مخزنالمعرض') || warehouseName.includes('showroom')) {
            showroomStock += quantity;
            return;
        }

        if (warehouseName.includes('المخزنالرئيسي') || warehouseName.includes('warehouse')) {
            warehouseStock += quantity;
        }
    });

    if (showroomStock === 0 && warehouseStock === 0) {
        const totalStock = getDcTotalStock(item);
        if (Number.isFinite(totalStock) && totalStock > 0) {
            warehouseStock = totalStock;
        }
    }

    return { showroomStock, warehouseStock };
}

function getProductLowStockThreshold(product = {}) {
    const threshold = Number(product.lowStockThreshold || product.low_stock_threshold || 5);
    return Number.isFinite(threshold) && threshold > 0 ? threshold : 5;
}

function buildDcLookupMap(items) {
    const nextMap = {};

    items.forEach((item) => {
        getDcItemMatchCodes(item).forEach((code) => {
            if (!nextMap[code]) {
                nextMap[code] = item;
            }
        });
    });

    return nextMap;
}

function getFirstPositivePriceValue(values = []) {
    for (const value of values) {
        if (value === undefined || value === null) continue;
        if (typeof value === 'string' && value.trim() === '') continue;

        const parsedValue = parsePrice(value);
        if (parsedValue > 0) {
            return parsedValue;
        }
    }

    return 0;
}

function getPreferredRetailPrice(product = {}, dcProduct = {}, dcStock = {}) {
    return getFirstPositivePriceValue([
        dcProduct?.price,
        dcProduct?.retailPrice,
        dcProduct?.retail_price,
        dcProduct?.salePrice,
        dcProduct?.sellingPrice,
        dcStock?.price,
        dcStock?.retailPrice,
        dcStock?.retail_price,
        dcStock?.salePrice,
        dcStock?.sellingPrice,
        product?.price,
        product?.retailPrice,
        product?.retail_price,
        product?.salePrice,
        product?.sellingPrice
    ]);
}

function getPreferredWholesalePrice(product = {}, dcProduct = {}, dcStock = {}) {
    const wholesale = getFirstPositivePriceValue([
        dcProduct?.wholesalePrice,
        dcProduct?.wholesale_price,
        dcProduct?.cartonPrice,
        dcProduct?.wholesaleCartonPrice,
        dcProduct?.priceWholesale,
        dcProduct?.bulkPrice,
        dcProduct?.bulk_price,
        dcStock?.wholesalePrice,
        dcStock?.wholesale_price,
        dcStock?.cartonPrice,
        dcStock?.wholesaleCartonPrice,
        dcStock?.priceWholesale,
        dcStock?.bulkPrice,
        dcStock?.bulk_price,
        product?.wholesalePrice,
        product?.wholesale_price,
        product?.cartonPrice,
        product?.wholesaleCartonPrice,
        product?.priceWholesale,
        product?.bulkPrice,
        product?.bulk_price
    ]);

    return wholesale > 0 ? wholesale : 'N/A';
}

function mergeProductWithDcData(product, dcProduct, dcStock) {
    const liveEntry = dcStock || dcProduct;
    if (!dcProduct && !dcStock) return product;

    const retailPrice = getPreferredRetailPrice(product, dcProduct, dcStock);
    const wholesalePrice = getPreferredWholesalePrice(product, dcProduct, dcStock);
    const warehouseBuckets = getDcWarehouseBuckets(liveEntry || {});
    const discountAmount = parsePrice(
        dcProduct?.discount_amount
        || dcProduct?.discountAmount
        || dcProduct?.discount
        || dcStock?.discount_amount
        || dcStock?.discountAmount
        || dcStock?.discount
        || product?.discount_amount
        || product?.discountAmount
        || product?.discount
    );
    const totalStock = getDcTotalStock(liveEntry);
    const threshold = getProductLowStockThreshold(product);
    const manufacturer = String(dcStock?.manufacturer || dcProduct?.manufacturer || '').trim().toLowerCase();

    const mergedProduct = {
        ...product,
        ...(liveEntry?.barcode ? { matchedBarcode: liveEntry.barcode } : {}),
        ...(manufacturer && !product.brand ? { brand: manufacturer } : {}),
        ...(manufacturer && !product.manufacturer ? { manufacturer } : {}),
        ...(retailPrice > 0 ? {
            price: retailPrice,
            retailPrice,
            retail_price: retailPrice
        } : {}),
        ...(wholesalePrice !== 0 ? {
            wholesalePrice,
            wholesale_price: wholesalePrice,
            cartonPrice: wholesalePrice
        } : {}),
        ...(discountAmount > 0 ? {
            discountAmount,
            discount_amount: discountAmount,
            discount: discountAmount
        } : {})
    };

    if (totalStock === null) {
        return mergedProduct;
    }

    return {
        ...mergedProduct,
        remainingQuantity: totalStock,
        totalStock,
        total_stock: totalStock,
        showroomStock: warehouseBuckets.showroomStock,
        retailStock: warehouseBuckets.showroomStock,
        warehouseStock: warehouseBuckets.warehouseStock,
        wholesaleStock: warehouseBuckets.warehouseStock,
        stock_by_warehouse: liveEntry?.stock_by_warehouse || liveEntry?.stockByWarehouse || product?.stock_by_warehouse,
        stockByWarehouse: liveEntry?.stockByWarehouse || liveEntry?.stock_by_warehouse || product?.stockByWarehouse,
        stockStatus: totalStock <= 0
            ? 'out_of_stock'
            : totalStock <= threshold
                ? 'low_stock'
                : 'in_stock'
    };
}

function enrichProductVariantsWithDcData(product, dcProductsMap, dcStockMap) {
    const variants = Array.isArray(product?.variants) ? product.variants : null;
    if (!variants || variants.length === 0) return product;

    return {
        ...product,
        variants: variants.map((variant) => {
            const variantCodes = getProductMatchCodes(variant);
            const dcVariantProduct = variantCodes.map((code) => dcProductsMap[code]).find(Boolean) || null;
            const dcVariantStock = variantCodes.map((code) => dcStockMap[code]).find(Boolean) || null;
            const liveEntry = dcVariantStock || dcVariantProduct;
            const stockBuckets = getDcWarehouseBuckets(liveEntry || {});
            const totalStock = getDcTotalStock(liveEntry || {});
            const hasLiveStock = Number.isFinite(totalStock);

            const variantRetailPrice = getPreferredRetailPrice(variant, dcVariantProduct, dcVariantStock);
            const variantWholesalePrice = getPreferredWholesalePrice(variant, dcVariantProduct, dcVariantStock);
            const variantDiscountAmount = parsePrice(
                dcVariantProduct?.discount_amount || dcVariantProduct?.discountAmount || dcVariantProduct?.discount ||
                dcVariantStock?.discount_amount || dcVariantStock?.discountAmount || dcVariantStock?.discount ||
                variant?.discount_amount || variant?.discountAmount || variant?.discount
            );

            return {
                ...variant,
                ...(variantRetailPrice > 0 ? { price: variantRetailPrice, retailPrice: variantRetailPrice, retail_price: variantRetailPrice } : {}),
                ...(variantWholesalePrice > 0 ? { wholesalePrice: variantWholesalePrice, wholesale_price: variantWholesalePrice, cartonPrice: variantWholesalePrice } : {}),
                ...(variantDiscountAmount > 0 ? { discountAmount: variantDiscountAmount, discount_amount: variantDiscountAmount, discount: variantDiscountAmount, discountValue: variantDiscountAmount } : {}),
                ...(dcVariantStock?.barcode || dcVariantProduct?.barcode ? {
                    matchedBarcode: dcVariantStock?.barcode || dcVariantProduct?.barcode || '-'
                } : {}),
                ...(hasLiveStock ? {
                    remainingQuantity: totalStock,
                    showroomStock: stockBuckets.showroomStock,
                    retailStock: stockBuckets.showroomStock,
                    warehouseStock: stockBuckets.warehouseStock,
                    wholesaleStock: stockBuckets.warehouseStock,
                    totalStock,
                    total_stock: totalStock,
                    stock_by_warehouse: liveEntry?.stock_by_warehouse || liveEntry?.stockByWarehouse || variant?.stock_by_warehouse,
                    stockByWarehouse: liveEntry?.stockByWarehouse || liveEntry?.stock_by_warehouse || variant?.stockByWarehouse,
                    stockStatus: totalStock <= 0 ? 'out_of_stock' : 'in_stock'
                } : {}),
                isLinked: !!liveEntry
            };
        })
    };
}

function areEqualValues(leftValue, rightValue) {
    return JSON.stringify(leftValue ?? null) === JSON.stringify(rightValue ?? null);
}

function buildSnapshotPatch(currentProduct, mergedProduct) {
    const patch = {};
    let didChange = false;

    SYNCED_PRODUCT_FIELDS.forEach((fieldName) => {
        if (!areEqualValues(currentProduct?.[fieldName], mergedProduct?.[fieldName])) {
            patch[fieldName] = mergedProduct?.[fieldName] ?? null;
            didChange = true;
        }
    });

    if (!areEqualValues(currentProduct?.variants, mergedProduct?.variants)) {
        patch.variants = Array.isArray(mergedProduct?.variants) ? mergedProduct.variants : [];
        didChange = true;
    }

    if (!didChange) {
        return null;
    }

    patch.dcSnapshotSyncedAt = admin.firestore.FieldValue.serverTimestamp();
    return patch;
}

async function fetchDcJson(url, errorMessage) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DC_REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            signal: controller.signal,
            cache: 'no-store'
        });

        const payloadText = await response.text();
        const parsedPayload = payloadText ? JSON.parse(payloadText) : null;

        if (!response.ok) {
            const error = new Error(parsedPayload?.error || errorMessage);
            error.status = response.status;
            throw error;
        }

        return parsedPayload;
    } catch (error) {
        if (error?.name === 'AbortError') {
            const timeoutError = new Error(errorMessage.replace('Failed', 'Timed out while fetching'));
            timeoutError.status = 504;
            throw timeoutError;
        }

        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}

async function commitSnapshotPatches(db, patches = []) {
    if (patches.length === 0) {
        return 0;
    }

    let batch = db.batch();
    let operationsInBatch = 0;
    let committedCount = 0;

    for (const entry of patches) {
        batch.set(db.collection('products').doc(entry.id), entry.patch, { merge: true });
        operationsInBatch += 1;

        if (operationsInBatch >= FIRESTORE_BATCH_LIMIT) {
            await batch.commit();
            committedCount += operationsInBatch;
            batch = db.batch();
            operationsInBatch = 0;
        }
    }

    if (operationsInBatch > 0) {
        await batch.commit();
        committedCount += operationsInBatch;
    }

    return committedCount;
}

export async function POST(request) {
    try {
        await verifyAdminRequest({
            headers: {
                authorization: request.headers.get('authorization') || ''
            }
        });

        const db = getDb();
        const [productsPayload, stockPayload] = await Promise.all([
            fetchDcJson(process.env.DC_PUBLIC_PRODUCTS_URL || DEFAULT_DC_PRODUCTS_URL, 'Failed to fetch DC products feed'),
            fetchDcJson(process.env.DC_PUBLIC_STOCK_URL || DEFAULT_DC_STOCK_URL, 'Failed to fetch DC stock feed')
        ]);

        const dcProductsMap = buildDcLookupMap(getDcFeedItems(productsPayload));
        const dcStockMap = buildDcLookupMap(getDcFeedItems(stockPayload));
        const productsSnapshot = await db.collection('products').get();
        const patches = [];
        let matchedCount = 0;

        productsSnapshot.docs.forEach((docSnapshot) => {
            const product = {
                id: docSnapshot.id,
                ...docSnapshot.data()
            };
            const productCodes = getProductMatchCodes(product);
            const dcProduct = productCodes.map((code) => dcProductsMap[code]).find(Boolean) || null;
            const dcStock = productCodes.map((code) => dcStockMap[code]).find(Boolean) || null;

            if (!dcProduct && !dcStock) {
                return;
            }

            matchedCount += 1;

            const mergedProduct = enrichProductVariantsWithDcData(
                mergeProductWithDcData(product, dcProduct, dcStock),
                dcProductsMap,
                dcStockMap
            );
            const patch = buildSnapshotPatch(product, mergedProduct);

            if (patch) {
                patches.push({ id: docSnapshot.id, patch });
            }
        });

        const updatedCount = await commitSnapshotPatches(db, patches);

        return NextResponse.json({
            success: true,
            matchedCount,
            updatedCount
        });
    } catch (error) {
        console.error('Failed to persist DC snapshot baseline:', error);
        return NextResponse.json(
            { error: error?.message || 'Failed to persist DC snapshot baseline' },
            { status: error?.status || 500 }
        );
    }
}