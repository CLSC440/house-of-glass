import { NextResponse } from 'next/server';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { admin, getDb, verifyRequestUser } = require('../../../../api/_firebaseAdmin.js');
const { buildPushSubscriptionId, getWebPushConfig, isWebPushConfigured } = require('../../../../api/_webPush.js');

function createError(status, message) {
    const error = new Error(message);
    error.status = status;
    return error;
}

function normalizeSubscription(rawSubscription = {}) {
    const endpoint = String(rawSubscription.endpoint || '').trim();
    const p256dh = String(rawSubscription?.keys?.p256dh || '').trim();
    const auth = String(rawSubscription?.keys?.auth || '').trim();

    if (!endpoint || !p256dh || !auth) {
        throw createError(400, 'A valid push subscription is required');
    }

    return {
        endpoint,
        expirationTime: rawSubscription.expirationTime || null,
        keys: {
            p256dh,
            auth
        }
    };
}

export async function GET() {
    const config = getWebPushConfig();
    return NextResponse.json({
        supported: isWebPushConfigured(),
        publicKey: config.publicKey || ''
    });
}

export async function POST(request) {
    try {
        const tokenData = await verifyRequestUser({
            headers: {
                authorization: request.headers.get('authorization') || ''
            }
        });

        if (!isWebPushConfigured()) {
            throw createError(503, 'Web push is not configured yet');
        }

        const payload = await request.json().catch(() => ({}));
        const subscription = normalizeSubscription(payload?.subscription || payload);
        const userAgent = String(payload?.userAgent || request.headers.get('user-agent') || '').slice(0, 500);
        const subscriptionId = buildPushSubscriptionId(tokenData.uid, subscription.endpoint);
        const db = getDb();

        await db.collection('push_subscriptions').doc(subscriptionId).set({
            userId: tokenData.uid,
            subscription,
            userAgent,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        return NextResponse.json({ ok: true, id: subscriptionId });
    } catch (error) {
        const status = Number(error?.status) || 500;
        return NextResponse.json({ ok: false, error: error?.message || 'Failed to save push subscription' }, { status });
    }
}

export async function DELETE(request) {
    try {
        const tokenData = await verifyRequestUser({
            headers: {
                authorization: request.headers.get('authorization') || ''
            }
        });

        const payload = await request.json().catch(() => ({}));
        const endpoint = String(payload?.endpoint || '').trim();
        if (!endpoint) {
            throw createError(400, 'endpoint is required');
        }

        const subscriptionId = buildPushSubscriptionId(tokenData.uid, endpoint);
        await getDb().collection('push_subscriptions').doc(subscriptionId).delete();

        return NextResponse.json({ ok: true });
    } catch (error) {
        const status = Number(error?.status) || 500;
        return NextResponse.json({ ok: false, error: error?.message || 'Failed to remove push subscription' }, { status });
    }
}