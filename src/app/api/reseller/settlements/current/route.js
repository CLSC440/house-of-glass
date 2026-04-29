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

const { getDb, getUserRoleContext, verifyRequestUser } = firebaseAdminModule;

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

export async function GET(request) {
    try {
        const { tokenData, roleContext } = await getResellerRoleContext(request);
        const batchDateKey = createBatchDateKey();
        const settlementKey = createSettlementKey(roleContext.uid, batchDateKey);
        const batchId = createSettlementBatchId(roleContext.uid, batchDateKey);
        const db = getDb();
        const [ordersSnapshot, batchSnapshot] = await Promise.all([
            db.collection(RESELLER_ORDERS_COLLECTION)
                .where('resellerUid', '==', roleContext.uid)
                .where('settlementKey', '==', settlementKey)
                .get(),
            db.collection(RESELLER_SETTLEMENT_BATCHES_COLLECTION).doc(batchId).get()
        ]);

        const orders = sortOrdersByCreatedAtDesc(ordersSnapshot.docs.map((documentSnapshot) => ({
            id: documentSnapshot.id,
            ...documentSnapshot.data()
        })));
        const existingBatch = batchSnapshot.exists ? batchSnapshot.data() : null;
        const totals = existingBatch?.totals || buildBatchTotals(orders);

        return NextResponse.json({
            success: true,
            batch: {
                id: batchId,
                batchDateKey,
                settlementKey,
                status: existingBatch?.status || 'open',
                branchSnapshot: existingBatch?.branchSnapshot || RESELLER_BRANCH_SNAPSHOT,
                resellerSnapshot: existingBatch?.resellerSnapshot || buildResellerSnapshot(roleContext, tokenData),
                totals,
                orders,
                hasOrders: orders.length > 0,
                submittedAtIso: existingBatch?.submittedAtIso || '',
                updatedAtIso: existingBatch?.updatedAtIso || '',
                createdAtIso: existingBatch?.createdAtIso || ''
            }
        });
    } catch (error) {
        const status = Number(error?.status || 500);
        return NextResponse.json({
            success: false,
            error: error?.message || 'Failed to load current reseller settlement batch.'
        }, { status });
    }
}