import { NextResponse } from 'next/server';
import { listBostaDistrictOptionsForGovernorate } from '@/lib/bosta';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
    try {
        const governorate = String(request.nextUrl.searchParams.get('governorate') || '').trim();

        if (!governorate) {
            return NextResponse.json({
                ok: false,
                error: 'governorate is required'
            }, { status: 400 });
        }

        const result = await listBostaDistrictOptionsForGovernorate(governorate);

        return NextResponse.json({
            ok: true,
            governorate,
            city: result.city,
            districts: result.districts
        });
    } catch (error) {
        const status = Number(error?.status) || 500;

        return NextResponse.json({
            ok: false,
            error: error?.message || 'Failed to load Bosta districts'
        }, { status });
    }
}