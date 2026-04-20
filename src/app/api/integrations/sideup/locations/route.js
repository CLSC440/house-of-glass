import { NextResponse } from 'next/server';
import { listSideUpLocationOptionsForGovernorate } from '@/lib/sideup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const governorate = String(searchParams.get('governorate') || '').trim();

        if (!governorate) {
            return NextResponse.json({
                ok: false,
                error: 'governorate is required',
                code: 'sideup_governorate_required'
            }, { status: 400 });
        }

        const result = await listSideUpLocationOptionsForGovernorate(governorate);
        return NextResponse.json({
            ok: true,
            governorate,
            city: result.city,
            areas: result.areas
        });
    } catch (error) {
        return NextResponse.json({
            ok: false,
            error: error?.message || 'Failed to load SideUp locations',
            code: error?.code || 'sideup_locations_failed',
            details: error?.details && typeof error.details === 'object' ? error.details : undefined
        }, { status: Number(error?.status) || 500 });
    }
}