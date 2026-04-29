import { NextResponse } from 'next/server';
import firebaseAdminModule from '../../../../api/_firebaseAdmin.js';
import { applyGlobalRetailIncrease, parsePercentage } from '@/lib/site-pricing';
import { buildOrderStatusHistoryEntry } from '@/lib/utils/order-status';

const { getAdmin, getDb, getUserRoleContext, verifyRequestUser } = firebaseAdminModule;

const RESELLER_ORDERS_COLLECTION = 'resellerOrders';

function createError(status, message) {
    const error = new Error(message);
    error.status = status;
    return error;
}

function normalizeText(value, maxLength = 200) {
    return String(value || '').trim().slice(0, maxLength);
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
    return normalizeText(product.code || product.barcode || product.matchedBarcode || product.productCode || product.sku || product.itemCode || '', 120);
}

function getProductImage(product = {}) {
    return product.image || product.imageUrl || product.url || product.images?.[0] || '/logo.png';
}

function getProductName(product = {}) {
    return normalizeText(product.title || product.name || 'Unnamed Product', 200) || 'Unnamed Product';
}

function buildPricingSnapshot(entry = {}, priceIncreasePercentage, permissions = {}) {
    const wholesaleUnitRaw = getItemUnitPrice(entry, 'wholesale');
    const retailBaseUnitRaw = getItemUnitPrice(entry, 'retail');
    const discountUnitRaw = getDiscountAmount(entry);
    const packUnitRaw = retailBaseUnitRaw > 0 ? Math.max(0, retailBaseUnitRaw - discountUnitRaw) : 0;
    const publicUnitRaw = retailBaseUnitRaw > 0 ? applyGlobalRetailIncrease(retailBaseUnitRaw, priceIncreasePercentage) : 0;

    const wholesaleUnit = permissions.viewPriceWholesale === true && wholesaleUnitRaw > 0 ? roundCurrency(wholesaleUnitRaw) : null;
    const retailBaseUnit = permissions.viewPriceRetail === true && retailBaseUnitRaw > 0 ? roundCurrency(retailBaseUnitRaw) : null;
    const packUnit = permissions.viewPricePack === true && packUnitRaw > 0 ? roundCurrency(packUnitRaw) : null;
    const discountUnit = permissions.viewPriceDiscount === true && discountUnitRaw > 0 ? roundCurrency(discountUnitRaw) : null;
    const publicUnit = permissions.viewPriceFinal === true && publicUnitRaw > 0 ? roundCurrency(publicUnitRaw) : null;
    const profitAtPublicUnit = wholesaleUnit !== null && publicUnit !== null ? roundCurrency(publicUnit - wholesaleUnit) : null;

    return {
        wholesaleUnit,
        retailBaseUnit,
        packUnit,
        discountUnit,
        publicUnit,
        profitAtPublicUnit
    };
}

function buildCatalogEntry({ product, variant = null, variantIndex = -1, priceIncreasePercentage, permissions }) {
    const sourceEntry = variant || product;
    const productName = getProductName(product);
    const variantLabel = variant ? normalizeText(variant.name || variant.label || `Variant ${variantIndex + 1}`, 160) : '';
    const title = variant ? `${productName} / ${variantLabel}` : productName;
    const pricing = buildPricingSnapshot(sourceEntry, priceIncreasePercentage, permissions);
    const hasVisiblePrice = Object.values(pricing).some((value) => value !== null);

    if (!hasVisiblePrice) {
        return null;
    }

    return {
        key: variant ? `variant:${product.id}:${variantIndex}` : `product:${product.id}`,
        productId: product.id,
        productSlug: normalizeText(product.slug || '', 200),
        title,
        productName,
        variantLabel,
        productCode: getProductCode(sourceEntry) || getProductCode(product),
        category: normalizeText(sourceEntry.category || product.category || '', 120),
        image: getProductImage(sourceEntry) || getProductImage(product),
        isVariant: Boolean(variant),
        pricing
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

    return entries;
}

async function getPriceIncreasePercentage(db) {
    const settingsSnapshot = await db.collection('settings').doc('contact').get();
    return parsePercentage(settingsSnapshot.exists ? settingsSnapshot.data()?.priceIncrease : 0);
}

async function allocateResellerOrderRef(db) {
    const admin = getAdmin();
    const counterRef = db.collection('settings').doc('orderCounter');

    try {
        const nextNumber = await db.runTransaction(async (transaction) => {
            const counterSnapshot = await transaction.get(counterRef);
            const currentNumber = Number(counterSnapshot.data()?.lastResellerOrderNumber || 1000);
            const safeCurrentNumber = Number.isFinite(currentNumber) && currentNumber >= 1000 ? currentNumber : 1000;
            const nextValue = safeCurrentNumber + 1;

            transaction.set(counterRef, {
                lastResellerOrderNumber: nextValue,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            return nextValue;
        });

        return `RSL-${nextNumber}`;
    } catch (_error) {
        return `RSL-${Date.now()}`;
    }
}

function createSettlementKey(resellerUid, createdAtIso) {
    return `${resellerUid}:${String(createdAtIso || '').slice(0, 10)}`;
}

function validateCustomerSnapshot(customer = {}) {
    const name = normalizeText(customer.name, 160);
    const phone = normalizeText(customer.phone, 60);
    const notes = normalizeText(customer.notes, 500);

    if (!name) {
        throw createError(400, 'Customer name is required.');
    }

    if (!phone) {
        throw createError(400, 'Customer phone is required.');
    }

    return { name, phone, notes };
}

async function getResellerRoleContext(request) {
    const authorizationHeader = request.headers.get('authorization') || '';
    const tokenData = await verifyRequestUser({ headers: { authorization: authorizationHeader } });
    const roleContext = await getUserRoleContext(tokenData.uid);

    if (roleContext.role !== 'reseller') {
        throw createError(403, 'Reseller access is required.');
    }

    return {
        tokenData,
        roleContext
    };
}

async function buildLineItems({ db, requestedItems, permissions, priceIncreasePercentage }) {
    const normalizedRequestedItems = Array.isArray(requestedItems) ? requestedItems : [];
    if (normalizedRequestedItems.length === 0) {
        throw createError(400, 'At least one draft item is required.');
    }

    const productIds = Array.from(new Set(normalizedRequestedItems.map((item) => normalizeText(item.productId, 128)).filter(Boolean)));
    if (productIds.length === 0) {
        throw createError(400, 'Each draft item must include a valid productId.');
    }

    const products = await Promise.all(productIds.map(async (productId) => {
        const productSnapshot = await db.collection('products').doc(productId).get();
        if (!productSnapshot.exists) {
            throw createError(400, `Product not found for id: ${productId}`);
        }

        return {
            id: productSnapshot.id,
            ...productSnapshot.data()
        };
    }));

    const catalogEntries = buildCatalogEntries(products, priceIncreasePercentage, permissions);
    const catalogMap = new Map(catalogEntries.map((entry) => [entry.key, entry]));

    return normalizedRequestedItems.map((item, index) => {
        const selectionKey = normalizeText(item.key, 160);
        const productId = normalizeText(item.productId, 128);
        const matchedEntry = catalogMap.get(selectionKey);

        if (!selectionKey || !matchedEntry || matchedEntry.productId !== productId) {
            throw createError(400, `Draft item ${index + 1} is invalid or outdated.`);
        }

        const quantity = Math.max(1, Math.floor(parseAmount(item.quantity) || 1));
        const sellUnit = roundCurrency(Math.max(0, parseAmount(item.sellUnit)));
        const wholesaleUnit = roundCurrency(parseAmount(matchedEntry.pricing.wholesaleUnit));
        const publicUnit = roundCurrency(parseAmount(matchedEntry.pricing.publicUnit));
        const profitUnit = roundCurrency(sellUnit - wholesaleUnit);

        return {
            lineId: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
            selectionKey,
            productId: matchedEntry.productId,
            productTitle: matchedEntry.productName,
            productSlug: matchedEntry.productSlug,
            variantKey: matchedEntry.isVariant ? matchedEntry.key : '',
            variantLabel: matchedEntry.variantLabel,
            image: matchedEntry.image,
            code: matchedEntry.productCode,
            category: matchedEntry.category,
            quantity,
            pricingSnapshot: {
                wholesaleUnit,
                publicUnit,
                sellUnit,
                profitUnit,
                wholesaleTotal: roundCurrency(wholesaleUnit * quantity),
                publicTotal: roundCurrency(publicUnit * quantity),
                sellTotal: roundCurrency(sellUnit * quantity),
                profitTotal: roundCurrency(profitUnit * quantity)
            }
        };
    });
}

function buildOrderTotals(items = []) {
    return items.reduce((totals, item) => ({
        quantity: totals.quantity + item.quantity,
        wholesale: roundCurrency(totals.wholesale + item.pricingSnapshot.wholesaleTotal),
        public: roundCurrency(totals.public + item.pricingSnapshot.publicTotal),
        sold: roundCurrency(totals.sold + item.pricingSnapshot.sellTotal),
        profit: roundCurrency(totals.profit + item.pricingSnapshot.profitTotal)
    }), {
        quantity: 0,
        wholesale: 0,
        public: 0,
        sold: 0,
        profit: 0
    });
}

export async function GET(request) {
    try {
        const { roleContext } = await getResellerRoleContext(request);
        const db = getDb();
        const ordersSnapshot = await db.collection(RESELLER_ORDERS_COLLECTION).where('resellerUid', '==', roleContext.uid).get();
        const orders = ordersSnapshot.docs
            .map((documentSnapshot) => ({ id: documentSnapshot.id, ...documentSnapshot.data() }))
            .sort((leftOrder, rightOrder) => new Date(rightOrder.createdAtIso || 0) - new Date(leftOrder.createdAtIso || 0));

        return NextResponse.json({ success: true, orders });
    } catch (error) {
        const status = Number(error?.status || 500);
        return NextResponse.json({ success: false, error: error?.message || 'Failed to load reseller orders.' }, { status });
    }
}

export async function POST(request) {
    try {
        const { tokenData, roleContext } = await getResellerRoleContext(request);
        const body = await request.json().catch(() => ({}));
        const customerSnapshot = validateCustomerSnapshot(body?.customer || {});
        const db = getDb();
        const admin = getAdmin();
        const createdAtIso = new Date().toISOString();
        const priceIncreasePercentage = await getPriceIncreasePercentage(db);
        const items = await buildLineItems({
            db,
            requestedItems: body?.items,
            permissions: roleContext.permissions,
            priceIncreasePercentage
        });
        const totals = buildOrderTotals(items);
        const orderNumber = await allocateResellerOrderRef(db);
        const settlementKey = createSettlementKey(roleContext.uid, createdAtIso);
        const statusHistory = [buildOrderStatusHistoryEntry('pending', {
            at: createdAtIso,
            updatedBy: {
                uid: roleContext.uid,
                email: tokenData.email || roleContext.userData?.email || ''
            }
        })];

        const orderPayload = {
            orderNumber,
            channel: 'reseller',
            source: 'reseller-workspace',
            status: 'pending',
            fulfillmentType: 'branch_pickup',
            resellerUid: roleContext.uid,
            resellerSnapshot: {
                uid: roleContext.uid,
                name: normalizeText(roleContext.userData?.name || tokenData.name || tokenData.email || 'Reseller', 160),
                email: normalizeText(roleContext.userData?.email || tokenData.email || '', 254),
                roleKey: 'reseller'
            },
            customerSnapshot,
            branchSnapshot: {
                id: 'branch-pickup',
                label: 'Branch Pickup'
            },
            items,
            totals,
            settlementKey,
            settlementBatchId: null,
            createdByUid: roleContext.uid,
            lastEditedByUid: roleContext.uid,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            createdAtIso,
            updatedAtIso: createdAtIso,
            confirmedAt: null,
            statusHistory
        };

        const orderRef = await db.collection(RESELLER_ORDERS_COLLECTION).add(orderPayload);

        return NextResponse.json({
            success: true,
            order: {
                id: orderRef.id,
                orderNumber,
                status: orderPayload.status,
                customerSnapshot,
                totals,
                settlementKey,
                createdAtIso
            }
        });
    } catch (error) {
        const status = Number(error?.status || 500);
        return NextResponse.json({ success: false, error: error?.message || 'Failed to save reseller order.' }, { status });
    }
}