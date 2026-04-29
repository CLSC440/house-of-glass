import { NextResponse } from 'next/server';
import firebaseAdminModule from '../../../../../api/_firebaseAdmin.js';
import {
    buildBatchTotals,
    buildResellerSnapshot,
    createBatchDateKey,
    createSettlementBatchId,
    createSettlementKey,
    createError,
    RESELLER_BRANCH_SNAPSHOT,
    RESELLER_ORDERS_COLLECTION,
    RESELLER_SETTLEMENT_BATCHES_COLLECTION,
    sortOrdersByCreatedAtDesc
} from '@/lib/server/reseller-settlements';

const { getAdmin, getDb, getUserRoleContext, verifyRequestUser } = firebaseAdminModule;

async function getResellerRoleContext(request) {
    const authorizationHeader = request.headers.get('authorization') || '';
    const tokenData = await verifyRequestUser({ headers: { authorization: authorizationHeader } });
    const roleContext = await getUserRoleContext(tokenData.uid);

    if (roleContext.role !== 'reseller') {
        throw createError(403, 'Reseller access is required.');
    }

    return {
        tokenData,
        roleContext
    };
}

export async function POST(request) {
    try {
        const { tokenData, roleContext } = await getResellerRoleContext(request);
        const admin = getAdmin();
        const db = getDb();
        const batchDateKey = createBatchDateKey();
        const settlementKey = createSettlementKey(roleContext.uid, batchDateKey);
        const batchId = createSettlementBatchId(roleContext.uid, batchDateKey);
        const batchRef = db.collection(RESELLER_SETTLEMENT_BATCHES_COLLECTION).doc(batchId);
        const ordersSnapshot = await db.collection(RESELLER_ORDERS_COLLECTION)
            .where('resellerUid', '==', roleContext.uid)
            .where('settlementKey', '==', settlementKey)
            .get();

        const orders = sortOrdersByCreatedAtDesc(ordersSnapshot.docs.map((documentSnapshot) => ({
            id: documentSnapshot.id,
            ...documentSnapshot.data()
        })));

        if (orders.length === 0) {
            throw createError(400, 'No reseller orders are available to submit for today.');
        }

        const totals = buildBatchTotals(orders);
        if (totals.ordersCount === 0) {
            throw createError(400, 'Only cancelled orders exist in the current batch, so there is nothing to submit.');
        }

        const existingBatchSnapshot = await batchRef.get();
        const existingBatch = existingBatchSnapshot.exists ? existingBatchSnapshot.data() : null;
        const nowIso = new Date().toISOString();
        const writeBatch = db.batch();

        writeBatch.set(batchRef, {
            resellerUid: roleContext.uid,
            resellerSnapshot: existingBatch?.resellerSnapshot || buildResellerSnapshot(roleContext, tokenData),
            batchDateKey,
            settlementKey,
            branchSnapshot: existingBatch?.branchSnapshot || RESELLER_BRANCH_SNAPSHOT,
            status: 'submitted',
            orderIds: orders.map((order) => order.id),
            totals,
            submittedAt: admin.firestore.FieldValue.serverTimestamp(),
            submittedAtIso: nowIso,
            invoicedAt: existingBatch?.invoicedAt || null,
            paidAt: existingBatch?.paidAt || null,
            submittedByUid: roleContext.uid,
            lastStatusChangedByUid: roleContext.uid,
            adminNotes: existingBatch?.adminNotes || '',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAtIso: nowIso,
            ...(existingBatchSnapshot.exists ? {} : {
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                createdAtIso: nowIso
            })
        }, { merge: true });

        orders.forEach((order) => {
            writeBatch.update(db.collection(RESELLER_ORDERS_COLLECTION).doc(order.id), {
                settlementBatchId: batchId,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAtIso: nowIso
            });
        });

        await writeBatch.commit();

        return NextResponse.json({
            success: true,
            batch: {
                id: batchId,
                batchDateKey,
                settlementKey,
                status: 'submitted',
                branchSnapshot: existingBatch?.branchSnapshot || RESELLER_BRANCH_SNAPSHOT,
                resellerSnapshot: existingBatch?.resellerSnapshot || buildResellerSnapshot(roleContext, tokenData),
                totals,
                orders,
                hasOrders: orders.length > 0,
                submittedAtIso: nowIso,
                updatedAtIso: nowIso,
                createdAtIso: existingBatch?.createdAtIso || nowIso
            }
        });
    } catch (error) {
        const status = Number(error?.status || 500);
        return NextResponse.json({
            success: false,
            error: error?.message || 'Failed to submit the current reseller daily summary.'
        }, { status });
    }
}