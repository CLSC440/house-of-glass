import { NextResponse } from 'next/server';
import { createRequire } from 'module';
import { buildOrderStatusNotification } from '@/lib/utils/notifications';

const require = createRequire(import.meta.url);
const { admin, getDb, verifyRequestUser } = require('../../../../api/_firebaseAdmin.js');
const { sendWebPushNotification, isWebPushConfigured } = require('../../../../api/_webPush.js');

function createError(status, message) {
    const error = new Error(message);
    error.status = status;
    return error;
}

async function sendPushToUser(db, userId, payload) {
    if (!isWebPushConfigured() || !userId) {
        return;
    }

    const subscriptionsSnap = await db.collection('push_subscriptions').where('userId', '==', userId).get();
    if (subscriptionsSnap.empty) {
        return;
    }

    await Promise.all(subscriptionsSnap.docs.map(async (subscriptionDoc) => {
        try {
            await sendWebPushNotification(subscriptionDoc.data().subscription, payload);
        } catch (error) {
            const statusCode = Number(error?.statusCode || 0);
            if (statusCode === 404 || statusCode === 410) {
                await subscriptionDoc.ref.delete().catch(() => undefined);
            } else {
                console.error('Failed to send web push notification:', error);
            }
        }
    }));
}

export async function POST(request) {
    try {
        const tokenData = await verifyRequestUser({
            headers: {
                authorization: request.headers.get('authorization') || ''
            }
        });

        const db = getDb();
        const requesterSnap = await db.collection('users').doc(tokenData.uid).get();
        const requesterRole = String(requesterSnap.data()?.role || '').trim().toLowerCase();
        if (requesterRole !== 'admin' && requesterRole !== 'moderator') {
            throw createError(403, 'Admin or moderator access is required');
        }

        const payload = await request.json().catch(() => ({}));
        const orderId = String(payload?.orderId || '').trim();
        const nextStatus = String(payload?.status || '').trim();

        if (!orderId || !nextStatus) {
            throw createError(400, 'orderId and status are required');
        }

        const orderSnap = await db.collection('orders').doc(orderId).get();
        if (!orderSnap.exists) {
            throw createError(404, 'Order not found');
        }

        const orderData = { id: orderSnap.id, ...orderSnap.data() };
        const notificationPayload = buildOrderStatusNotification(orderData, nextStatus);
        if (!notificationPayload) {
            return NextResponse.json({ ok: true, created: false });
        }

        const notificationRef = db.collection('notifications').doc();
        await notificationRef.set({
            ...notificationPayload,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        await sendPushToUser(db, notificationPayload.userId, {
            title: notificationPayload.title,
            body: notificationPayload.message,
            url: '/profile#order-history'
        });

        return NextResponse.json({ ok: true, id: notificationRef.id });
    } catch (error) {
        const status = Number(error?.status) || 500;
        return NextResponse.json({ ok: false, error: error?.message || 'Failed to create order status notification' }, { status });
    }
}