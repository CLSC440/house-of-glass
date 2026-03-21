const { getDb, verifyRequestUser, getAdmin } = require('../_firebaseAdmin');

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

        grouped.get(key).variants.push({
            label: variantLabel,
            quantity
        });
    });

    return Array.from(grouped.values())
        .filter((group) => group.variants.length > 1)
        .map((group) => {
            const header = group.name ? `( ${group.name} )` : '';
            const breakdown = group.variants
                .map((entry) => `${entry.label} ×${entry.quantity}`)
                .join(' | ');
            return [header, `${group.code}: ${breakdown}`].filter(Boolean).join('\n');
        });
}

function buildNotes(order, items, invoiceType) {
    const notes = [];
    notes.push('طلب وارد من الموقع');

    if (order?.customer?.email) {
        notes.push(`Customer Email: ${order.customer.email}`);
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
    const directMessage = [
        payload?.message,
        payload?.error,
        payload?.detail,
        payload?.details,
        payload?.title
    ].find((value) => typeof value === 'string' && value.trim());

    if (directMessage) {
        return directMessage.trim();
    }

    if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
        return payload.errors
            .map((entry) => {
                if (typeof entry === 'string') return entry.trim();
                if (entry && typeof entry.message === 'string') return entry.message.trim();
                return '';
            })
            .filter(Boolean)
            .join(' | ');
    }

    return status >= 200 && status < 300
        ? 'Invoice synced successfully'
        : `DC request failed with status ${status}`;
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

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        ensureConfig();

        const decodedToken = await verifyRequestUser(req);
        const db = getDb();
        const admin = getAdmin();

        const userDoc = await db.collection('users').doc(decodedToken.uid).get();
        const role = userDoc.exists ? String(userDoc.data()?.role || '') : '';
        if (role !== 'admin' && role !== 'moderator') {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const orderId = String(req.body?.orderId || '').trim();
        if (!orderId) {
            return res.status(400).json({ error: 'orderId is required' });
        }

        const orderRef = db.collection('orders').doc(orderId);
        const orderSnap = await orderRef.get();
        if (!orderSnap.exists) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const order = { id: orderSnap.id, ...orderSnap.data() };
        const invoiceType = normalizeInvoiceType(order.orderType);
        const enrichedItems = await enrichOrderItems(db, order.items || []);
        const invalidItems = enrichedItems.filter((item) => !normalizeCode(item.productCode));

        if (invalidItems.length > 0) {
            const invalidNames = invalidItems.map((item) => item.name || item.productId || 'Unknown item');
            await orderRef.set({
                dcSync: {
                    status: 'failed',
                    failedAt: admin.firestore.FieldValue.serverTimestamp(),
                    message: `Missing productCode for: ${invalidNames.join(', ')}`,
                    attemptedBy: decodedToken.uid
                }
            }, { merge: true });

            return res.status(400).json({
                error: 'Missing productCode on one or more items',
                items: invalidNames
            });
        }

        const payload = {
            source: 'website',
            externalOrderId: order.id,
            invoiceType,
            customer: buildCustomer(order),
            notes: buildNotes(order, enrichedItems, invoiceType),
            paidAmount: 0,
            items: aggregateItems(enrichedItems)
        };

        await orderRef.set({
            dcSync: {
                status: 'sending',
                lastAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
                attemptedBy: decodedToken.uid,
                invoiceType,
                externalOrderId: order.id,
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
        const normalizedResponse = normalizeRemoteResponse(dcResponse.status, dcPayload, order.id);

        if (!normalizedResponse.success) {
            await orderRef.set({
                dcSync: {
                    status: 'failed',
                    failedAt: admin.firestore.FieldValue.serverTimestamp(),
                    attemptedBy: decodedToken.uid,
                    invoiceType,
                    externalOrderId: order.id,
                    message: normalizedResponse.message,
                    response: normalizedResponse.raw
                }
            }, { merge: true });

            return res.status(502).json(normalizedResponse);
        }

        await orderRef.set({
            dcSync: {
                status: 'success',
                sentAt: admin.firestore.FieldValue.serverTimestamp(),
                attemptedBy: decodedToken.uid,
                invoiceType,
                externalOrderId: order.id,
                dcInvoiceId: normalizedResponse.dcInvoiceId,
                message: normalizedResponse.message,
                response: normalizedResponse.raw
            }
        }, { merge: true });

        return res.status(200).json(normalizedResponse);
    } catch (error) {
        console.error('Online invoice integration error:', error);
        const status = error.status || 500;
        return res.status(status).json({
            error: error.message || 'Internal Server Error'
        });
    }
};