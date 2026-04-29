import { NextResponse } from 'next/server';
import firebaseAdminModule from '../../../../api/_firebaseAdmin.js';
import { applyGlobalRetailIncrease, parsePercentage } from '@/lib/site-pricing';

const { getDb, getUserRoleContext, verifyRequestUser } = firebaseAdminModule;

function createError(status, message) {
    const error = new Error(message);
    error.status = status;
    return error;
}

function normalizeLookupText(value) {
    return String(value || '').trim().toLowerCase();
}

function roundCurrency(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
        return 0;
    }

    return Math.round((numericValue + Number.EPSILON) * 100) / 100;
}

function parseAmount(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === 'string') {
        const normalized = value.replace(/[^\d.-]/g, '');
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    return 0;
}

function getItemUnitPrice(item = {}, orderType = 'retail') {
    if (orderType === 'wholesale') {
        return parseAmount(
            item.wholesalePrice
            || item.wholesale_price
            || item.cartonPrice
            || item.wholesaleCartonPrice
            || item.priceWholesale
            || item.bulkPrice
            || item.bulk_price
            || 0
        );
    }

    return parseAmount(
        item.price
        || item.retailPrice
        || item.retail_price
        || item.salePrice
        || item.sellingPrice
        || item.wholesalePrice
        || 0
    );
}

function getDiscountAmount(item = {}) {
    return parseAmount(item.discountAmount || item.discount_amount || item.discount || 0);
}

function getProductCode(product = {}) {
    return String(product.code || product.barcode || product.matchedBarcode || product.productCode || product.sku || product.itemCode || '').trim();
}

function getProductImage(product = {}) {
    return product.image || product.imageUrl || product.url || product.images?.[0] || '/logo.png';
}

function getProductName(product = {}) {
    return String(product.title || product.name || 'Unnamed Product').trim() || 'Unnamed Product';
}

function getProductStockTotal(product = {}) {
    const candidates = [
        product.remainingQuantity,
        product.totalStock,
        product.total_stock,
        product.wholesaleStock,
        product.warehouseStock,
        product.retailStock,
        product.showroomStock
    ];

    for (const candidate of candidates) {
        const parsed = Number(candidate);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }

    return 0;
}

function buildSearchIndex(parts = []) {
    return parts
        .map(normalizeLookupText)
        .filter(Boolean)
        .join(' ');
}

function buildPricingSnapshot(entry = {}, priceIncreasePercentage, permissions = {}) {
    const wholesaleUnitRaw = getItemUnitPrice(entry, 'wholesale');
    const retailBaseUnitRaw = getItemUnitPrice(entry, 'retail');
    const discountUnitRaw = getDiscountAmount(entry);
    const packUnitRaw = retailBaseUnitRaw > 0 ? Math.max(0, retailBaseUnitRaw - discountUnitRaw) : 0;
    const publicUnitRaw = retailBaseUnitRaw > 0
        ? applyGlobalRetailIncrease(retailBaseUnitRaw, priceIncreasePercentage)
        : 0;

    const canViewWholesale = permissions.viewPriceWholesale === true;
    const canViewRetail = permissions.viewPriceRetail === true;
    const canViewPack = permissions.viewPricePack === true;
    const canViewDiscount = permissions.viewPriceDiscount === true;
    const canViewFinal = permissions.viewPriceFinal === true;

    const wholesaleUnit = canViewWholesale && wholesaleUnitRaw > 0 ? roundCurrency(wholesaleUnitRaw) : null;
    const retailBaseUnit = canViewRetail && retailBaseUnitRaw > 0 ? roundCurrency(retailBaseUnitRaw) : null;
    const packUnit = canViewPack && packUnitRaw > 0 ? roundCurrency(packUnitRaw) : null;
    const discountUnit = canViewDiscount && discountUnitRaw > 0 ? roundCurrency(discountUnitRaw) : null;
    const publicUnit = canViewFinal && publicUnitRaw > 0 ? roundCurrency(publicUnitRaw) : null;
    const profitAtPublicUnit = wholesaleUnit !== null && publicUnit !== null
        ? roundCurrency(publicUnit - wholesaleUnit)
        : null;

    return {
        wholesaleUnit,
        retailBaseUnit,
        packUnit,
        discountUnit,
        publicUnit,
        profitAtPublicUnit
    };
}

function buildCatalogEntry({
    product,
    variant = null,
    variantIndex = -1,
    priceIncreasePercentage,
    permissions
}) {
    const sourceEntry = variant || product;
    const productName = getProductName(product);
    const variantLabel = variant ? String(variant.name || variant.label || `Variant ${variantIndex + 1}`).trim() : '';
    const title = variant ? `${productName} / ${variantLabel}` : productName;
    const productCode = getProductCode(sourceEntry) || getProductCode(product);
    const category = String(sourceEntry.category || product.category || '').trim();
    const pricing = buildPricingSnapshot(sourceEntry, priceIncreasePercentage, permissions);
    const hasVisiblePrice = Object.values(pricing).some((value) => value !== null);

    if (!hasVisiblePrice) {
        return null;
    }

    return {
        key: variant ? `variant:${product.id}:${variantIndex}` : `product:${product.id}`,
        productId: product.id,
        variantKey: variant ? `${product.id}:${variantIndex}` : '',
        title,
        productName,
        variantLabel,
        productCode,
        category,
        image: getProductImage(sourceEntry) || getProductImage(product),
        stockTotal: getProductStockTotal(sourceEntry || product),
        stockStatus: String(sourceEntry.stockStatus || product.stockStatus || '').trim() || 'unknown',
        pricing,
        isVariant: Boolean(variant),
        searchIndex: buildSearchIndex([
            title,
            productName,
            variantLabel,
            productCode,
            category,
            product.id
        ])
    };
}

function buildCatalogEntries(products = [], priceIncreasePercentage, permissions = {}) {
    const entries = [];

    (Array.isArray(products) ? products : []).forEach((product) => {
        if (!product || product.isHidden === true) {
            return;
        }

        const productEntry = buildCatalogEntry({
            product,
            priceIncreasePercentage,
            permissions
        });

        if (productEntry) {
            entries.push(productEntry);
        }

        (Array.isArray(product.variants) ? product.variants : []).forEach((variant, index) => {
            const variantEntry = buildCatalogEntry({
                product,
                variant,
                variantIndex: index,
                priceIncreasePercentage,
                permissions
            });

            if (variantEntry) {
                entries.push(variantEntry);
            }
        });
    });

    return entries.sort((leftEntry, rightEntry) => leftEntry.title.localeCompare(rightEntry.title));
}

async function getPriceIncreasePercentage(db) {
    const settingsSnapshot = await db.collection('settings').doc('contact').get();
    return parsePercentage(settingsSnapshot.exists ? settingsSnapshot.data()?.priceIncrease : 0);
}

export async function GET(request) {
    try {
        const authorizationHeader = request.headers.get('authorization') || '';
        const tokenData = await verifyRequestUser({ headers: { authorization: authorizationHeader } });
        const roleContext = await getUserRoleContext(tokenData.uid);

        if (roleContext.role !== 'reseller') {
            throw createError(403, 'Reseller access is required.');
        }

        const db = getDb();
        const [productsSnapshot, priceIncreasePercentage] = await Promise.all([
            db.collection('products').get(),
            getPriceIncreasePercentage(db)
        ]);

        const products = productsSnapshot.docs.map((documentSnapshot) => ({
            id: documentSnapshot.id,
            ...documentSnapshot.data()
        }));

        const items = buildCatalogEntries(products, priceIncreasePercentage, roleContext.permissions);

        return NextResponse.json({
            success: true,
            items,
            meta: {
                priceIncreasePercentage,
                count: items.length,
                branchPickupOnly: true
            }
        });
    } catch (error) {
        const status = Number(error?.status || 500);
        return NextResponse.json({
            success: false,
            error: error?.message || 'Failed to load reseller catalog.'
        }, { status });
    }
}