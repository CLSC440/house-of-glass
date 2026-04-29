import { NextResponse } from 'next/server';
import firebaseAdminModule from '../../../../api/_firebaseAdmin.js';
import { RESELLER_SETTLEMENT_BATCHES_COLLECTION } from '@/lib/server/reseller-settlements';

const { getDb, requireRequestPermission, ROLE_PERMISSION_KEYS } = firebaseAdminModule;

export async function GET(request) {
    try {
        const authorizationHeader = request.headers.get('authorization') || '';
        await requireRequestPermission({ headers: { authorization: authorizationHeader } }, ROLE_PERMISSION_KEYS.ACCESS_ADMIN, 'Admin access is required.');

        const db = getDb();
        const batchesSnapshot = await db.collection(RESELLER_SETTLEMENT_BATCHES_COLLECTION).get();
        const batches = batchesSnapshot.docs
            .map((documentSnapshot) => ({ id: documentSnapshot.id, ...documentSnapshot.data() }))
            .sort((leftBatch, rightBatch) => new Date(rightBatch.submittedAtIso || rightBatch.updatedAtIso || rightBatch.batchDateKey || 0) - new Date(leftBatch.submittedAtIso || leftBatch.updatedAtIso || leftBatch.batchDateKey || 0));

        return NextResponse.json({
            success: true,
            batches
        });
    } catch (error) {
        const status = Number(error?.status || 500);
        return NextResponse.json({
            success: false,
            error: error?.message || 'Failed to load reseller settlement batches.'
        }, { status });
    }
}