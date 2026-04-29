import { NextResponse } from 'next/server';
import { createRequire } from 'module';
import { buildAdminOrderCreatedNotification } from '@/lib/utils/notifications';

const require = createRequire(import.meta.url);
const { admin, getDb, verifyRequestUser, listUsersWithRolePermission, ROLE_PERMISSION_KEYS } = require('../../../../api/_firebaseAdmin.js');
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

        const payload = await request.json().catch(() => ({}));
        const orderId = String(payload?.orderId || '').trim();

        if (!orderId) {
            throw createError(400, 'orderId is required');
        }

        const db = getDb();
        const orderRef = db.collection('orders').doc(orderId);
        const orderSnap = await orderRef.get();

        if (!orderSnap.exists) {
            throw createError(404, 'Order not found');
        }

        const orderData = { id: orderSnap.id, ...orderSnap.data() };
        const orderOwnerUid = String(orderData?.customer?.uid || orderData?.customerInfo?.uid || '').trim();

        if (!orderOwnerUid || orderOwnerUid !== tokenData.uid) {
            throw createError(403, 'You are not allowed to notify admins about this order');
        }

        const privilegedUsers = await listUsersWithRolePermission(ROLE_PERMISSION_KEYS.VIEW_ORDERS);
        if (privilegedUsers.length === 0) {
            return NextResponse.json({ ok: true, notificationsCreated: 0 });
        }

        const batch = db.batch();
        let notificationsCreated = 0;

        privilegedUsers.forEach((userData) => {
            const notificationPayload = buildAdminOrderCreatedNotification(orderData, userData.id);
            if (!notificationPayload) {
                return;
            }

            const notificationRef = db.collection('notifications').doc();
            batch.set(notificationRef, {
                ...notificationPayload,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            notificationsCreated += 1;
        });

        if (notificationsCreated > 0) {
            await batch.commit();

            await Promise.all(privilegedUsers.map(async (userData) => {
                const notificationPayload = buildAdminOrderCreatedNotification(orderData, userData.id);
                if (!notificationPayload) {
                    return;
                }

                await sendPushToUser(db, userData.id, {
                    title: notificationPayload.title,
                    body: notificationPayload.message,
                    url: notificationPayload.actionHref || '/admin/orders'
                });
            }));
        }

        return NextResponse.json({ ok: true, notificationsCreated });
    } catch (error) {
        const status = Number(error?.status) || 500;
        return NextResponse.json({ ok: false, error: error?.message || 'Failed to create order notifications' }, { status });
    }
}