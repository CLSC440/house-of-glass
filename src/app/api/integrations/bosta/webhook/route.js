import { NextResponse } from 'next/server';
import firebaseAdminModule from '../../../../../api/_firebaseAdmin.js';
import { extractBostaWebhookPayload, verifyBostaWebhookHeaders } from '@/lib/bosta';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const { getDb, admin } = firebaseAdminModule;

function createError(status, message, code) {
    const error = new Error(message);
    error.status = status;
    error.code = code || '';
    return error;
}

async function findOrderByBostaIdentifiers(db, { trackingNumber, businessReference }) {
    if (trackingNumber) {
        const trackingSnap = await db.collection('orders')
            .where('bostaSync.trackingNumber', '==', trackingNumber)
            .limit(1)
            .get();

        if (!trackingSnap.empty) {
            return trackingSnap.docs[0];
        }
    }

    if (businessReference) {
        const websiteRefSnap = await db.collection('orders')
            .where('websiteOrderRef', '==', businessReference)
            .limit(1)
            .get();

        if (!websiteRefSnap.empty) {
            return websiteRefSnap.docs[0];
        }

        const bostaRefSnap = await db.collection('orders')
            .where('bostaSync.businessReference', '==', businessReference)
            .limit(1)
            .get();

        if (!bostaRefSnap.empty) {
            return bostaRefSnap.docs[0];
        }
    }

    return null;
}

export async function POST(request) {
    try {
        if (!verifyBostaWebhookHeaders(request.headers)) {
            throw createError(401, 'Invalid Bosta webhook signature', 'bosta_webhook_forbidden');
        }

        const db = getDb();
        const payload = await request.json().catch(() => ({}));
        const normalized = extractBostaWebhookPayload(payload);
        const orderSnap = await findOrderByBostaIdentifiers(db, normalized);
        const receivedAtIso = new Date().toISOString();

        const eventRef = await db.collection('bostaWebhookEvents').add({
            matchedOrderId: orderSnap?.id || '',
            trackingNumber: normalized.trackingNumber || '',
            businessReference: normalized.businessReference || '',
            deliveryId: normalized.deliveryId || '',
            stateCode: normalized.stateCode || '',
            stateLabel: normalized.stateLabel || '',
            message: normalized.message || '',
            payload,
            receivedAt: admin.firestore.FieldValue.serverTimestamp(),
            receivedAtIso
        });

        if (orderSnap) {
            await orderSnap.ref.set({
                bostaSync: {
                    ...(orderSnap.data()?.bostaSync || {}),
                    status: 'success',
                    trackingNumber: normalized.trackingNumber || orderSnap.data()?.bostaSync?.trackingNumber || '',
                    businessReference: normalized.businessReference || orderSnap.data()?.bostaSync?.businessReference || '',
                    deliveryId: normalized.deliveryId || orderSnap.data()?.bostaSync?.deliveryId || '',
                    stateCode: normalized.stateCode || orderSnap.data()?.bostaSync?.stateCode || '',
                    stateLabel: normalized.stateLabel || orderSnap.data()?.bostaSync?.stateLabel || '',
                    message: normalized.message || normalized.stateLabel || orderSnap.data()?.bostaSync?.message || 'Bosta webhook received',
                    lastWebhookAt: receivedAtIso,
                    lastWebhookEventId: eventRef.id
                },
                updatedAt: receivedAtIso,
                bostaUpdatedAt: receivedAtIso
            }, { merge: true });
        }

        return NextResponse.json({
            ok: true,
            matchedOrderId: orderSnap?.id || null,
            eventId: eventRef.id
        });
    } catch (error) {
        const status = Number(error?.status) || 500;
        return NextResponse.json({
            ok: false,
            error: error?.message || 'Failed to process Bosta webhook',
            code: error?.code || 'bosta_webhook_failed'
        }, { status });
    }
}