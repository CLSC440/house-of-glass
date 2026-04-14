import { NextResponse } from 'next/server';
import firebaseAdminModule from '../../../../api/_firebaseAdmin.js';
import { assertBostaAccountCanCreateOrders, createBostaDeliveryForOrder } from '@/lib/bosta';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const { getDb, verifyRequestUser } = firebaseAdminModule;

function createError(status, message, code) {
    const error = new Error(message);
    error.status = status;
    error.code = code || '';
    return error;
}

function getRequesterRole(data = {}) {
    return String(data?.role || '').trim().toLowerCase();
}

function canCreateBostaShipment(order = {}) {
    const deliveryMethod = String(order.deliveryMethod || order.customerInfo?.deliveryMethod || order.customer?.deliveryMethod || '').trim().toLowerCase();
    const status = String(order.status || '').trim().toLowerCase();
    return deliveryMethod === 'shipping' && status !== 'pending' && status !== 'cancelled';
}

function removeUndefinedFields(payload = {}) {
    return Object.fromEntries(
        Object.entries(payload).filter(([, value]) => value !== undefined)
    );
}

function buildBostaSyncPayload({ status, message, requester, result, districtHint = '' }) {
    const nowIso = new Date().toISOString();

    return removeUndefinedFields({
        status,
        message,
        updatedAt: nowIso,
        lastRequestedAt: nowIso,
        lastRequestedBy: requester ? {
            uid: requester.uid,
            email: requester.email || '',
            role: requester.role || ''
        } : undefined,
        districtHint: districtHint || undefined,
        trackingNumber: result?.trackingNumber || undefined,
        deliveryId: result?.deliveryId || undefined,
        businessReference: result?.businessReference || undefined,
        stateCode: result?.stateCode || undefined,
        stateLabel: result?.stateLabel || undefined,
        cityId: result?.cityId || undefined,
        cityName: result?.cityName || undefined,
        districtId: result?.districtId || undefined,
        districtName: result?.districtName || undefined,
        zoneId: result?.zoneId || undefined
    });
}

export async function POST(request) {
    let orderRef = null;
    let requestBody = {};
    let requester = null;
    let shouldPersistFailure = false;

    try {
        const tokenData = await verifyRequestUser({
            headers: {
                authorization: request.headers.get('authorization') || ''
            }
        });

        const db = getDb();
        const requesterSnap = await db.collection('users').doc(tokenData.uid).get();
        const requesterRole = getRequesterRole(requesterSnap.data());
        if (requesterRole !== 'admin' && requesterRole !== 'moderator') {
            throw createError(403, 'Admin or moderator access is required', 'bosta_forbidden');
        }

        requestBody = await request.json().catch(() => ({}));
        const orderId = String(requestBody?.orderId || '').trim();
        const districtHint = String(requestBody?.districtHint || '').trim();
        const force = requestBody?.force === true;

        if (!orderId) {
            throw createError(400, 'orderId is required', 'bosta_order_id_required');
        }

        orderRef = db.collection('orders').doc(orderId);
        const orderSnap = await orderRef.get();
        if (!orderSnap.exists) {
            throw createError(404, 'Order not found', 'bosta_order_not_found');
        }

        const order = { id: orderSnap.id, ...orderSnap.data() };
        if (!canCreateBostaShipment(order)) {
            throw createError(409, 'Only reviewed shipping orders can be sent to Bosta', 'bosta_order_not_ready');
        }

        if (!force && String(order.bostaSync?.status || '').trim().toLowerCase() === 'success' && String(order.bostaSync?.trackingNumber || '').trim()) {
            throw createError(409, 'This order already has a Bosta tracking number', 'bosta_already_sent');
        }

        requester = {
            uid: tokenData.uid,
            email: tokenData.email || '',
            role: requesterRole
        };

        shouldPersistFailure = true;
        await assertBostaAccountCanCreateOrders();

        await orderRef.set({
            bostaSync: buildBostaSyncPayload({
                status: 'sending',
                message: 'Creating shipment on Bosta...',
                requester,
                districtHint
            }),
            updatedAt: new Date().toISOString()
        }, { merge: true });

        const result = await createBostaDeliveryForOrder(order, {
            districtHint,
            requestOrigin: request.nextUrl.origin
        });

        await orderRef.set({
            bostaSync: buildBostaSyncPayload({
                status: 'success',
                message: result.message || 'Shipment created successfully on Bosta',
                requester,
                result,
                districtHint
            }),
            updatedAt: new Date().toISOString(),
            bostaUpdatedAt: new Date().toISOString()
        }, { merge: true });

        return NextResponse.json({
            ok: true,
            trackingNumber: result.trackingNumber,
            deliveryId: result.deliveryId,
            stateCode: result.stateCode,
            stateLabel: result.stateLabel,
            businessReference: result.businessReference
        });
    } catch (error) {
        if (orderRef && shouldPersistFailure) {
            try {
                await orderRef.set({
                    bostaSync: buildBostaSyncPayload({
                        status: 'failed',
                        message: error?.message || 'Failed to create shipment on Bosta',
                        requester,
                        districtHint: String(requestBody?.districtHint || '').trim()
                    }),
                    updatedAt: new Date().toISOString(),
                    bostaUpdatedAt: new Date().toISOString()
                }, { merge: true });
            } catch (persistError) {
                console.error('Failed to persist Bosta sync error state:', persistError);
            }
        }

        const status = Number(error?.status) || 500;
        return NextResponse.json({
            ok: false,
            error: error?.message || 'Failed to create Bosta shipment',
            code: error?.code || 'bosta_create_failed'
        }, { status });
    }
}