import { NextResponse } from 'next/server';
import firebaseAdminModule from '../../../../api/_firebaseAdmin.js';
import { buildSideUpOrderPreview, createSideUpOrderForOrder, hasSideUpCreateCredentials, refreshSideUpOrderStatus } from '@/lib/sideup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const { getDb, verifyRequestUser } = firebaseAdminModule;

function createError(status, message, code, details) {
    const error = new Error(message);
    error.status = status;
    error.code = code || 'sideup_error';
    if (details && typeof details === 'object') {
        error.details = details;
    }
    return error;
}

function removeUndefinedFields(payload = {}) {
    return Object.fromEntries(
        Object.entries(payload).filter(([, value]) => value !== undefined)
    );
}

function getRequesterRole(data = {}) {
    return String(data?.role || '').trim().toLowerCase();
}

function getOrderDeliveryMethod(order = {}) {
    return String(order.deliveryMethod || order.customerInfo?.deliveryMethod || order.customer?.deliveryMethod || '').trim().toLowerCase() === 'shipping'
        ? 'shipping'
        : 'pickup';
}

function canCreateSideUpShipment(order = {}) {
    const deliveryMethod = getOrderDeliveryMethod(order);
    const status = String(order.status || '').trim().toLowerCase();
    return deliveryMethod === 'shipping' && status !== 'pending' && status !== 'cancelled';
}

function canRefreshSideUpShipment(order = {}) {
    const deliveryMethod = getOrderDeliveryMethod(order);
    return deliveryMethod === 'shipping' && Boolean(String(order.sideupSync?.shipmentCode || order.websiteOrderRef || '').trim());
}

function buildRequesterPayload(requester) {
    return requester ? {
        uid: requester.uid,
        email: requester.email || '',
        role: requester.role || ''
    } : undefined;
}

function buildSideUpSyncPayload({ status, message, requester, areaHint = '', preview, result }) {
    const nowIso = new Date().toISOString();

    return removeUndefinedFields({
        status,
        message,
        updatedAt: nowIso,
        lastRequestedAt: nowIso,
        lastRequestedBy: buildRequesterPayload(requester),
        areaHint: areaHint || undefined,
        shipmentCode: result?.shipmentCode || preview?.payloads?.postman?.shipment_code || undefined,
        sideupOrderId: result?.orderId || undefined,
        orderStatus: result?.status || undefined,
        courierName: result?.courierName || undefined,
        payloadFormat: result?.payloadFormat || undefined,
        cityId: result?.cityId || preview?.location?.city?.id,
        cityName: result?.cityName || preview?.location?.city?.name,
        areaId: result?.areaId || preview?.location?.area?.id,
        areaName: result?.areaName || preview?.location?.area?.name,
        zoneId: result?.zoneId || preview?.location?.zone?.id,
        zoneName: result?.zoneName || preview?.location?.zone?.name
    });
}

function serializeErrorDetails(error) {
    if (!error?.details || typeof error.details !== 'object') {
        return undefined;
    }

    return removeUndefinedFields({
        ...error.details,
        availableAreas: Array.isArray(error.details.availableAreas)
            ? error.details.availableAreas.slice(0, 20)
            : undefined,
        availableAreaNames: Array.isArray(error.details.availableAreaNames)
            ? error.details.availableAreaNames.slice(0, 20)
            : undefined
    });
}

export async function POST(request) {
    let orderRef = null;
    let requester = null;
    let requestBody = {};
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
            throw createError(403, 'Admin or moderator access is required', 'sideup_forbidden');
        }

        requestBody = await request.json().catch(() => ({}));
        const orderId = String(requestBody?.orderId || '').trim();
        const areaHint = String(requestBody?.areaHint || '').trim();
        const rawMode = String(requestBody?.mode || 'preview').trim().toLowerCase();
        const mode = rawMode === 'create'
            ? 'create'
            : rawMode === 'refresh'
                ? 'refresh'
                : 'preview';
        const force = requestBody?.force === true;

        if (!orderId) {
            throw createError(400, 'orderId is required', 'sideup_order_id_required');
        }

        orderRef = db.collection('orders').doc(orderId);
        const orderSnap = await orderRef.get();
        if (!orderSnap.exists) {
            throw createError(404, 'Order not found', 'sideup_order_not_found');
        }

        const order = { id: orderSnap.id, ...orderSnap.data() };
        if (mode === 'refresh' && !canRefreshSideUpShipment(order)) {
            throw createError(409, 'Only shipping orders with a SideUp shipment code can be refreshed', 'sideup_refresh_not_ready');
        }

        if (mode !== 'refresh' && !canCreateSideUpShipment(order)) {
            throw createError(409, 'Only reviewed shipping orders can be prepared for SideUp', 'sideup_order_not_ready');
        }

        requester = {
            uid: tokenData.uid,
            email: tokenData.email || '',
            role: requesterRole
        };

        if (mode === 'preview') {
            const preview = await buildSideUpOrderPreview(order, { areaHint });

            return NextResponse.json({
                ok: true,
                mode,
                createReady: hasSideUpCreateCredentials(),
                location: preview.location,
                payloads: preview.payloads,
                shipmentCode: preview.payloads?.postman?.shipment_code || null
            });
        }

        if (mode === 'refresh') {
            const result = await refreshSideUpOrderStatus(order);

            await orderRef.set({
                sideupSync: buildSideUpSyncPayload({
                    status: 'success',
                    message: result.status
                        ? `SideUp status: ${result.status}`
                        : 'Shipment is still registered on SideUp',
                    requester,
                    result
                }),
                updatedAt: new Date().toISOString(),
                sideupUpdatedAt: new Date().toISOString()
            }, { merge: true });

            return NextResponse.json({
                ok: true,
                mode,
                shipmentCode: result.shipmentCode || null,
                sideupOrderId: result.orderId || null,
                orderStatus: result.status || null,
                courierName: result.courierName || null
            });
        }

        if (!force && String(order.sideupSync?.status || '').trim().toLowerCase() === 'success' && String(order.sideupSync?.shipmentCode || '').trim()) {
            throw createError(409, 'This order already has a SideUp shipment code', 'sideup_already_sent');
        }

        shouldPersistFailure = true;
        await orderRef.set({
            sideupSync: buildSideUpSyncPayload({
                status: 'sending',
                message: 'Creating order on SideUp...',
                requester,
                areaHint
            }),
            updatedAt: new Date().toISOString()
        }, { merge: true });

        const { preview, result, usedPayloadFormat } = await createSideUpOrderForOrder(order, { areaHint });

        await orderRef.set({
            sideupSync: buildSideUpSyncPayload({
                status: 'success',
                message: result.message || 'Order created successfully on SideUp',
                requester,
                areaHint,
                preview,
                result: {
                    ...result,
                    payloadFormat: usedPayloadFormat
                }
            }),
            updatedAt: new Date().toISOString(),
            sideupUpdatedAt: new Date().toISOString()
        }, { merge: true });

        return NextResponse.json({
            ok: true,
            mode,
            shipmentCode: result.shipmentCode || null,
            sideupOrderId: result.orderId || null,
            usedPayloadFormat
        });
    } catch (error) {
        if (orderRef && shouldPersistFailure) {
            try {
                await orderRef.set({
                    sideupSync: buildSideUpSyncPayload({
                        status: 'failed',
                        message: error?.message || 'Failed to create order on SideUp',
                        requester,
                        areaHint: String(requestBody?.areaHint || '').trim()
                    }),
                    updatedAt: new Date().toISOString(),
                    sideupUpdatedAt: new Date().toISOString()
                }, { merge: true });
            } catch (persistError) {
                console.error('Failed to persist SideUp sync error state:', persistError);
            }
        }

        const status = Number(error?.status) || 500;
        return NextResponse.json({
            ok: false,
            error: error?.message || 'Failed to prepare SideUp order',
            code: error?.code || 'sideup_request_failed',
            details: serializeErrorDetails(error)
        }, { status });
    }
}