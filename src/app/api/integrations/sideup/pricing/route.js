import { NextResponse } from 'next/server';
import { getSideUpCheapestShippingRate, hasSideUpPricingCredentials } from '@/lib/sideup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const zoneId = Number(searchParams.get('zoneId'));
        const areaId = Number(searchParams.get('areaId'));
        const weightKg = Number(searchParams.get('weightKg'));
        const codAmount = Number(searchParams.get('codAmount'));
        const paymentMethod = String(searchParams.get('paymentMethod') || '').trim().toUpperCase() || undefined;

        if (!Number.isFinite(zoneId) || zoneId <= 0) {
            return NextResponse.json({
                ok: false,
                error: 'zoneId is required',
                code: 'sideup_pricing_zone_required'
            }, { status: 400 });
        }

        if (!hasSideUpPricingCredentials()) {
            return NextResponse.json({
                ok: false,
                error: 'Live SideUp pricing is not configured on the server',
                code: 'sideup_pricing_config_missing'
            }, { status: 503 });
        }

        const result = await getSideUpCheapestShippingRate({
            destinationZoneId: zoneId,
            destinationAreaId: Number.isFinite(areaId) && areaId > 0 ? areaId : undefined,
            weightKg: Number.isFinite(weightKg) && weightKg > 0 ? weightKg : undefined,
            paymentMethod,
            codAmount: Number.isFinite(codAmount) && codAmount >= 0 ? codAmount : undefined
        });

        return NextResponse.json({
            ok: true,
            livePricingAvailable: true,
            amount: result.amount,
            courierName: result.courierName,
            paymentMethod: result.paymentMethod,
            weightKg: result.weightKg,
            pickupZoneId: result.pickupZoneId,
            pickupAreaId: result.pickupAreaId,
            destinationZoneId: result.destinationZoneId,
            destinationAreaId: result.destinationAreaId,
            cheapestQuote: result.cheapestQuote,
            quotes: result.quotes
        });
    } catch (error) {
        return NextResponse.json({
            ok: false,
            error: error?.message || 'Failed to load SideUp shipping price',
            code: error?.code || 'sideup_pricing_failed',
            details: error?.details && typeof error.details === 'object' ? error.details : undefined
        }, { status: Number(error?.status) || 500 });
    }
}