import { NextResponse } from 'next/server';
import { admin, getAdmin, getDb } from '@/api/_firebaseAdmin';

export async function POST(req) {
    try {
        const body = await req.json().catch(() => ({}));
        const productId = body?.productId;

        if (!productId || typeof productId !== 'string') {
            return NextResponse.json({ error: 'Valid productId is required' }, { status: 400 });
        }

        // Ensure Admin is initialized
        getAdmin();
        const db = getDb();

        await db.collection('products').doc(productId).set({
            viewCount: admin.firestore.FieldValue.increment(1),
            lastViewedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to record product view:', error);
        return NextResponse.json(
            { error: 'Failed to record product view', details: error.message },
            { status: 500 }
        );
    }
}
