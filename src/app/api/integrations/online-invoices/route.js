import { NextResponse } from 'next/server';
import firebaseAdminModule from '../../../../api/_firebaseAdmin.js';

const { getDb, verifyRequestUser, getAdmin } = firebaseAdminModule;

const DC_ONLINE_INVOICE_URL = process.env.DC_ONLINE_INVOICE_URL;
const DC_ONLINE_INVOICE_API_KEY = process.env.DC_ONLINE_INVOICE_API_KEY;

function ensureConfig() {
    if (!DC_ONLINE_INVOICE_URL) {
        const error = new Error('DC_ONLINE_INVOICE_URL is not configured');
        error.status = 500;
        throw error;
    }

    if (!DC_ONLINE_INVOICE_API_KEY) {
        const error = new Error('DC_ONLINE_INVOICE_API_KEY is not configured');
        error.status = 500;
        throw error;
    }
}

function normalizeCode(value) {
    return String(value || '').trim();
}

function normalizeInvoiceType(orderType) {
    return String(orderType || '').toLowerCase() === 'wholesale' ? 'wholesale' : 'retail';
}

function normalizeVariantLabel(item = {}) {
    return item.variantLabel || item.variant || '';
}

function formatAccountRole(role) {
    const normalizedRole = String(role || '').trim().toLowerCase();

    if (normalizedRole === 'cst_wholesale') return 'CST Wholesale';
    if (normalizedRole === 'cst_retail') return 'CST Retail';
    if (normalizedRole === 'customer') return 'Customer';
    if (normalizedRole === 'guest') return 'Guest';

    return String(role || '').trim();
}

async function allocateWebsiteOrderRef(db, admin, orderRef) {
    const counterRef = db.collection('settings').doc('orderCounter');

    try {
        const nextNumber = await db.runTransaction(async (transaction) => {
            const counterSnap = await transaction.get(counterRef);
            const currentNumber = Number(counterSnap.data()?.lastWebsiteOrderNumber || 1000);
            const safeCurrentNumber = Number.isFinite(currentNumber) && currentNumber >= 1000 ? currentNumber : 1000;
            const nextValue = safeCurrentNumber + 1;

            transaction.set(counterRef, {
                lastWebsiteOrderNumber: nextValue,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            return nextValue;
        });

        const websiteOrderRef = `WEB-${nextNumber}`;
        await orderRef.set({ websiteOrderRef }, { merge: true });
        return websiteOrderRef;
    } catch (error) {
        console.warn('Falling back to timestamp-based website order ref', error);
        const fallbackRef = `WEB-${Date.now()}`;
        await orderRef.set({ websiteOrderRef: fallbackRef }, { merge: true });
        return fallbackRef;
    }
}

async function resolveMissingProductCode(db, item = {}, productCache) {
    const directCode = normalizeCode(item.productCode);
    if (directCode) return directCode;

    const productId = String(item.productId || '').trim();
    if (!productId) return '';

    let product = productCache.get(productId);
    if (product === undefined) {
        const productSnap = await db.collection('products').doc(productId).get();
        product = productSnap.exists ? productSnap.data() : null;
        productCache.set(productId, product);
    }

    if (!product) return '';

    const variantLabel = normalizeVariantLabel(item);
    if (variantLabel && Array.isArray(product.variants)) {
        const matchedVariant = product.variants.find((variant) => {
            const candidateName = String(variant?.name || variant?.label || '').trim();
            return candidateName === String(variantLabel).trim();
        });

        const variantCode = normalizeCode(matchedVariant?.barcode || matchedVariant?.code);
        if (variantCode) return variantCode;
    }

    const productCode = normalizeCode(product.code);
    if (productCode) return productCode;

    if (Array.isArray(product.variants) && product.variants.length > 0) {
        return normalizeCode(product.variants[0]?.barcode || product.variants[0]?.code);
    }

    return '';
}

async function enrichOrderItems(db, items = []) {
    const productCache = new Map();
    const enriched = [];

    for (const item of Array.isArray(items) ? items : []) {
        const resolvedCode = await resolveMissingProductCode(db, item, productCache);
        enriched.push({
            ...item,
            productCode: resolvedCode,
            variantLabel: normalizeVariantLabel(item),
            quantity: Number(item.quantity || 0)
        });
    }

    return enriched;
}

function buildSharedCodeNotes(items = []) {
    const grouped = new Map();

    items.forEach((item) => {
        const code = normalizeCode(item.productCode);
        const variantLabel = String(item.variantLabel || '').trim();
        const quantity = Number(item.quantity || 0);
        if (!code || !variantLabel || !Number.isFinite(quantity) || quantity <= 0) return;

        const key = `${code}::${item.name || ''}`;
        if (!grouped.has(key)) {
            grouped.set(key, {
                code,
                name: item.name || '',
                variants: []
            });
        }

        grouped.get(key).variants.push({ label: variantLabel, quantity });
    });

    return Array.from(grouped.values())
        .filter((group) => group.variants.length > 1)
        .map((group) => {
            const header = group.name ? `( ${group.name} )` : '';
            const breakdown = group.variants.map((entry) => `${entry.label} ×${entry.quantity}`).join(' | ');
            return [header, `${group.code}: ${breakdown}`].filter(Boolean).join('\n');
        });
}

function buildNotes(order, items, invoiceType) {
    const notes = [];
    notes.push('طلب وارد من الموقع');

    if (order?.customer?.email) {
        notes.push(`Customer Email: ${order.customer.email}`);
    }

    const accountRole = formatAccountRole(order?.customer?.role);
    if (accountRole) {
        notes.push(`Account Role: ${accountRole}`);
    }

    notes.push(`Order Type: ${invoiceType === 'wholesale' ? 'Wholesale' : 'Retail'}`);

    const sharedCodeLines = buildSharedCodeNotes(items);
    if (sharedCodeLines.length > 0) {
        notes.push(...sharedCodeLines);
    }

    return notes.join('\n');
}

function aggregateItems(items = []) {
    const grouped = new Map();

    items.forEach((item) => {
        const code = normalizeCode(item.productCode);
        const quantity = Number(item.quantity || 0);
        if (!code || !Number.isFinite(quantity) || quantity <= 0) return;

        const existing = grouped.get(code) || { code, quantity: 0 };
        existing.quantity += quantity;
        grouped.set(code, existing);
    });

    return Array.from(grouped.values());
}

function buildCustomer(order = {}) {
    const customer = order.customer || {};
    return {
        name: String(customer.name || 'Guest User').trim() || 'Guest User',
        phone: String(customer.phone || '').trim()
    };
}

function extractRemoteMessage(payload, status) {
    const directMessage = [payload?.message, payload?.error, payload?.detail, payload?.details, payload?.title]
        .find((value) => typeof value === 'string' && value.trim());

    if (directMessage) return directMessage.trim();

    if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
        return payload.errors
            .map((entry) => typeof entry === 'string' ? entry.trim() : (typeof entry?.message === 'string' ? entry.message.trim() : ''))
            .filter(Boolean)
            .join(' | ');
    }

    return status >= 200 && status < 300 ? 'Invoice synced successfully' : `DC request failed with status ${status}`;
}

function normalizeRemoteResponse(status, payload, fallbackExternalOrderId) {
    const dcInvoiceId = payload?.dcInvoiceId || payload?.dcInvoiceNumber || payload?.invoiceId || payload?.invoice_id || payload?.id || null;
    const message = extractRemoteMessage(payload, status);

    return {
        success: status >= 200 && status < 300 && payload?.success !== false,
        externalOrderId: payload?.externalOrderId || payload?.external_order_id || fallbackExternalOrderId,
        dcInvoiceId,
        message,
        raw: payload
    };
}

export async function POST(request) {
    try {
        ensureConfig();

        const headerBag = Object.fromEntries(request.headers.entries());
        const decodedToken = await verifyRequestUser({ headers: headerBag });
        const db = getDb();
        const admin = getAdmin();

        const userDoc = await db.collection('users').doc(decodedToken.uid).get();
        const role = userDoc.exists ? String(userDoc.data()?.role || '') : '';
        if (role !== 'admin' && role !== 'moderator') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await request.json().catch(() => ({}));
        const orderId = String(body?.orderId || '').trim();
        if (!orderId) {
            return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
        }

        const orderRef = db.collection('orders').doc(orderId);
        const orderSnap = await orderRef.get();
        if (!orderSnap.exists) {
            return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        }

        const order = { id: orderSnap.id, ...orderSnap.data() };
        const invoiceType = normalizeInvoiceType(order.orderType);
        const websiteOrderRef = order.websiteOrderRef || await allocateWebsiteOrderRef(db, admin, orderRef);
        const externalOrderId = String(websiteOrderRef || order.id || '').trim();
        const enrichedItems = await enrichOrderItems(db, order.items || []);
        const invalidItems = enrichedItems.filter((item) => !normalizeCode(item.productCode));

        if (invalidItems.length > 0) {
            const invalidNames = invalidItems.map((item) => item.name || item.productId || 'Unknown item');
            await orderRef.set({
                websiteOrderRef,
                dcSync: {
                    status: 'failed',
                    failedAt: admin.firestore.FieldValue.serverTimestamp(),
                    message: `Missing productCode for: ${invalidNames.join(', ')}`,
                    attemptedBy: decodedToken.uid
                }
            }, { merge: true });

            return NextResponse.json({
                error: 'Missing productCode on one or more items',
                items: invalidNames
            }, { status: 400 });
        }

        const payload = {
            source: 'website',
            externalOrderId,
            invoiceType,
            customer: buildCustomer(order),
            notes: buildNotes(order, enrichedItems, invoiceType),
            paidAmount: 0,
            items: aggregateItems(enrichedItems)
        };

        await orderRef.set({
            websiteOrderRef,
            dcSync: {
                status: 'sending',
                lastAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
                attemptedBy: decodedToken.uid,
                invoiceType,
                externalOrderId,
                payloadPreview: payload
            }
        }, { merge: true });

        const dcResponse = await fetch(DC_ONLINE_INVOICE_URL, {
            method: 'POST',
            headers: {
                'X-API-Key': DC_ONLINE_INVOICE_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const dcPayload = await dcResponse.json().catch(() => ({}));
        const normalizedResponse = normalizeRemoteResponse(dcResponse.status, dcPayload, externalOrderId);

        if (!normalizedResponse.success) {
            await orderRef.set({
                dcSync: {
                    status: 'failed',
                    failedAt: admin.firestore.FieldValue.serverTimestamp(),
                    attemptedBy: decodedToken.uid,
                    invoiceType,
                    externalOrderId,
                    message: normalizedResponse.message,
                    response: normalizedResponse.raw
                }
            }, { merge: true });

            return NextResponse.json(normalizedResponse, { status: 502 });
        }

        await orderRef.set({
            dcSync: {
                status: 'success',
                sentAt: admin.firestore.FieldValue.serverTimestamp(),
                attemptedBy: decodedToken.uid,
                invoiceType,
                externalOrderId,
                dcInvoiceId: normalizedResponse.dcInvoiceId,
                message: normalizedResponse.message,
                response: normalizedResponse.raw
            }
        }, { merge: true });

        return NextResponse.json(normalizedResponse);
    } catch (error) {
        console.error('Online invoice integration error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: error.status || 500 });
    }
}