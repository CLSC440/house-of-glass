import { NextResponse } from 'next/server';
import firebaseAdminModule from '../../../../../api/_firebaseAdmin.js';

const { getDb, getUserRoleContext, verifyRequestUser } = firebaseAdminModule;

function createError(status, message) {
    const error = new Error(message);
    error.status = status;
    return error;
}

function normalizeText(value, maxLength = 200) {
    return String(value || '').trim().slice(0, maxLength);
}

async function getResellerRoleContext(request) {
    const authorizationHeader = request.headers.get('authorization') || '';
    const tokenData = await verifyRequestUser({ headers: { authorization: authorizationHeader } });
    const roleContext = await getUserRoleContext(tokenData.uid);

    if (roleContext.role !== 'reseller') {
        throw createError(403, 'Reseller access is required.');
    }

    return roleContext;
}

export async function GET(request, { params }) {
    try {
        const roleContext = await getResellerRoleContext(request);
        const routeParams = await params;
        const orderId = normalizeText(routeParams?.orderId, 128);

        if (!orderId) {
            throw createError(400, 'Order id is required.');
        }

        const db = getDb();
        const orderSnapshot = await db.collection('resellerOrders').doc(orderId).get();
        if (!orderSnapshot.exists) {
            throw createError(404, 'Reseller order not found.');
        }

        const order = {
            id: orderSnapshot.id,
            ...orderSnapshot.data()
        };

        if (order.resellerUid !== roleContext.uid) {
            throw createError(404, 'Reseller order not found.');
        }

        return NextResponse.json({ success: true, order });
    } catch (error) {
        const status = Number(error?.status || 500);
        return NextResponse.json({ success: false, error: error?.message || 'Failed to load reseller order.' }, { status });
    }
}