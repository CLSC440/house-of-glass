import { NextResponse } from 'next/server';
import firebaseAdminModule from '../../../../../../../api/_firebaseAdmin.js';
import {
    createError,
    normalizeText,
    RESELLER_ORDERS_COLLECTION,
    RESELLER_SETTLEMENT_BATCHES_COLLECTION
} from '@/lib/server/reseller-settlements';

const { getDb, requireRequestPermission, ROLE_PERMISSION_KEYS } = firebaseAdminModule;

function orderBelongsToBatch(order = {}, batch = {}, batchId = '') {
    const batchOrderIds = Array.isArray(batch.orderIds) ? batch.orderIds.filter(Boolean) : [];
    return batchOrderIds.includes(order.id)
        || normalizeText(order.settlementBatchId, 180) === batchId
        || (batch.settlementKey && order.settlementKey && order.settlementKey === batch.settlementKey);
}

export async function GET(request, { params }) {
    try {
        const authorizationHeader = request.headers.get('authorization') || '';
        await requireRequestPermission({ headers: { authorization: authorizationHeader } }, ROLE_PERMISSION_KEYS.ACCESS_ADMIN, 'Admin access is required.');

        const routeParams = await params;
        const batchId = normalizeText(routeParams?.batchId, 180);
        const orderId = normalizeText(routeParams?.orderId, 180);
        if (!batchId || !orderId) {
            throw createError(400, 'Batch id and order id are required.');
        }

        const db = getDb();
        const [batchSnapshot, orderSnapshot] = await Promise.all([
            db.collection(RESELLER_SETTLEMENT_BATCHES_COLLECTION).doc(batchId).get(),
            db.collection(RESELLER_ORDERS_COLLECTION).doc(orderId).get()
        ]);

        if (!batchSnapshot.exists) {
            throw createError(404, 'Reseller settlement batch not found.');
        }

        if (!orderSnapshot.exists) {
            throw createError(404, 'Reseller order not found.');
        }

        const batch = {
            id: batchSnapshot.id,
            ...batchSnapshot.data()
        };
        const order = {
            id: orderSnapshot.id,
            ...orderSnapshot.data()
        };

        if (!orderBelongsToBatch(order, batch, batchId)) {
            throw createError(404, 'Reseller order was not found inside this settlement batch.');
        }

        return NextResponse.json({
            success: true,
            batch,
            order
        });
    } catch (error) {
        const status = Number(error?.status || 500);
        return NextResponse.json({
            success: false,
            error: error?.message || 'Failed to load reseller audit details.'
        }, { status });
    }
}