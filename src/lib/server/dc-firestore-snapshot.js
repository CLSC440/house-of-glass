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

export function getProductMatchCodes(product = {}) {
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

export function getDcFeedItems(payload) {
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

export function getDcTotalStock(item = {}) {
    return parseCount(item.total_stock)
        ?? parseCount(item.totalStock)
        ?? parseCount(item.quantity)
        ?? getWarehouseStockTotal(item.stock_by_warehouse)
        ?? getWarehouseStockTotal(item.stockByWarehouse);
}

export function getDcWarehouseBuckets(item = {}) {
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

export function buildDcLookupMap(items) {
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

export function mergeProductWithDcData(product, dcProduct, dcStock) {
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
    const manufacturer = normalizeInventoryCode(dcStock?.manufacturer || dcProduct?.manufacturer);

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

export function enrichProductVariantsWithDcData(product, dcProductsMap, dcStockMap) {
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

const SNAPSHOT_SYNC_FIELDS = [
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

function areValuesEqual(leftValue, rightValue) {
    if (leftValue === rightValue) {
        return true;
    }

    if (typeof leftValue === 'object' || typeof rightValue === 'object') {
        return JSON.stringify(leftValue ?? null) === JSON.stringify(rightValue ?? null);
    }

    return false;
}

export function buildProductSnapshotUpdate(product, mergedProduct, serverTimestampValue) {
    const nextUpdate = {};

    SNAPSHOT_SYNC_FIELDS.forEach((fieldName) => {
        if (!(fieldName in mergedProduct)) {
            return;
        }

        const nextValue = mergedProduct[fieldName];
        if (nextValue === undefined) {
            return;
        }

        if (areValuesEqual(product?.[fieldName], nextValue)) {
            return;
        }

        nextUpdate[fieldName] = nextValue;
    });

    const currentVariants = Array.isArray(product?.variants) ? product.variants : [];
    const nextVariants = Array.isArray(mergedProduct?.variants) ? mergedProduct.variants : [];

    if (!areValuesEqual(currentVariants, nextVariants)) {
        nextUpdate.variants = nextVariants;
    }

    if (Object.keys(nextUpdate).length === 0) {
        return null;
    }

    return {
        ...nextUpdate,
        dcSnapshotSyncedAt: serverTimestampValue
    };
}