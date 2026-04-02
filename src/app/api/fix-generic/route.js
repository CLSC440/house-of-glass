
import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const brandsSnap = await getDocs(collection(db, 'categories'));
        let hasGeneric = false;
        brandsSnap.forEach(snapDoc => {
            if (snapDoc.data().name?.toLowerCase() === 'generic') hasGeneric = true;
        });

        if (!hasGeneric) {
            const newDocRef = doc(collection(db, 'categories'));
            await setDoc(newDocRef, { name: 'Generic', order: 999 });
            return NextResponse.json({ success: true, created: true });
        }
        return NextResponse.json({ success: true, created: false });
    } catch (e) {
        return NextResponse.json({ error: e.message });
    }
}

