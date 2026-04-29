import { NextResponse } from 'next/server';
import firebaseAdminModule from '../../../../../api/_firebaseAdmin.js';
import {
    createError,
    normalizeSettlementStatus,
    normalizeText,
    RESELLER_ORDERS_COLLECTION,
    RESELLER_SETTLEMENT_BATCHES_COLLECTION,
    sortOrdersByCreatedAtDesc
} from '@/lib/server/reseller-settlements';

const { getAdmin, getDb, requireRequestPermission, ROLE_PERMISSION_KEYS } = firebaseAdminModule;

function buildSettlementStatusPatch(admin, existingBatch, nextStatus, nowIso) {
    const statusPatch = {};

    if (nextStatus === 'open' || nextStatus === 'submitted') {
        statusPatch.invoicedAt = admin.firestore.FieldValue.delete();
        statusPatch.invoicedAtIso = '';
        statusPatch.paidAt = admin.firestore.FieldValue.delete();
        statusPatch.paidAtIso = '';
        return statusPatch;
    }

    if (nextStatus === 'invoiced') {
        if (!existingBatch?.invoicedAt) {
            statusPatch.invoicedAt = admin.firestore.FieldValue.serverTimestamp();
        }
        statusPatch.invoicedAtIso = existingBatch?.invoicedAtIso || nowIso;
        statusPatch.paidAt = admin.firestore.FieldValue.delete();
        statusPatch.paidAtIso = '';
        return statusPatch;
    }

    if (nextStatus === 'paid') {
        if (!existingBatch?.invoicedAt) {
            statusPatch.invoicedAt = admin.firestore.FieldValue.serverTimestamp();
        }
        if (!existingBatch?.invoicedAtIso) {
            statusPatch.invoicedAtIso = nowIso;
        }
        if (!existingBatch?.paidAt) {
            statusPatch.paidAt = admin.firestore.FieldValue.serverTimestamp();
        }
        statusPatch.paidAtIso = existingBatch?.paidAtIso || nowIso;
    }

    return statusPatch;
}

export async function GET(request, { params }) {
    try {
        const authorizationHeader = request.headers.get('authorization') || '';
        await requireRequestPermission({ headers: { authorization: authorizationHeader } }, ROLE_PERMISSION_KEYS.ACCESS_ADMIN, 'Admin access is required.');

        const routeParams = await params;
        const batchId = normalizeText(routeParams?.batchId, 180);
        if (!batchId) {
            throw createError(400, 'Batch id is required.');
        }

        const db = getDb();
        const batchSnapshot = await db.collection(RESELLER_SETTLEMENT_BATCHES_COLLECTION).doc(batchId).get();
        if (!batchSnapshot.exists) {
            throw createError(404, 'Reseller settlement batch not found.');
        }

        const batch = {
            id: batchSnapshot.id,
            ...batchSnapshot.data()
        };

        const orderIds = Array.isArray(batch.orderIds) ? batch.orderIds.filter(Boolean) : [];
        let orders = [];

        if (orderIds.length > 0) {
            const orderSnapshots = await Promise.all(orderIds.map((orderId) => db.collection(RESELLER_ORDERS_COLLECTION).doc(orderId).get()));
            orders = orderSnapshots
                .filter((documentSnapshot) => documentSnapshot.exists)
                .map((documentSnapshot) => ({ id: documentSnapshot.id, ...documentSnapshot.data() }));
        }

        if (orders.length === 0) {
            const fallbackSnapshot = await db.collection(RESELLER_ORDERS_COLLECTION)
                .where('settlementBatchId', '==', batch.id)
                .get();
            orders = fallbackSnapshot.docs.map((documentSnapshot) => ({ id: documentSnapshot.id, ...documentSnapshot.data() }));
        }

        return NextResponse.json({
            success: true,
            batch,
            orders: sortOrdersByCreatedAtDesc(orders)
        });
    } catch (error) {
        const status = Number(error?.status || 500);
        return NextResponse.json({
            success: false,
            error: error?.message || 'Failed to load reseller settlement batch details.'
        }, { status });
    }
}

export async function PATCH(request, { params }) {
    try {
        const authorizationHeader = request.headers.get('authorization') || '';
        const permissionContext = await requireRequestPermission({ headers: { authorization: authorizationHeader } }, ROLE_PERMISSION_KEYS.ACCESS_ADMIN, 'Admin access is required.');

        const routeParams = await params;
        const batchId = normalizeText(routeParams?.batchId, 180);
        if (!batchId) {
            throw createError(400, 'Batch id is required.');
        }

        const requestBody = await request.json().catch(() => ({}));
        const nextStatus = normalizeSettlementStatus(requestBody?.status);
        const adminNotes = normalizeText(requestBody?.adminNotes, 1000);

        if (!nextStatus) {
            throw createError(400, 'A valid settlement status is required.');
        }

        const admin = getAdmin();
        const db = getDb();
        const batchRef = db.collection(RESELLER_SETTLEMENT_BATCHES_COLLECTION).doc(batchId);
        const batchSnapshot = await batchRef.get();
        if (!batchSnapshot.exists) {
            throw createError(404, 'Reseller settlement batch not found.');
        }

        const existingBatch = batchSnapshot.data() || {};

        const nowIso = new Date().toISOString();
        const statusTimestampField = buildSettlementStatusPatch(admin, existingBatch, nextStatus, nowIso);

        await batchRef.set({
            status: nextStatus,
            adminNotes: adminNotes || existingBatch.adminNotes || '',
            lastStatusChangedByUid: permissionContext.uid,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAtIso: nowIso,
            ...statusTimestampField
        }, { merge: true });

        const updatedSnapshot = await batchRef.get();
        return NextResponse.json({
            success: true,
            batch: {
                id: updatedSnapshot.id,
                ...updatedSnapshot.data()
            }
        });
    } catch (error) {
        const status = Number(error?.status || 500);
        return NextResponse.json({
            success: false,
            error: error?.message || 'Failed to update reseller settlement batch status.'
        }, { status });
    }
}