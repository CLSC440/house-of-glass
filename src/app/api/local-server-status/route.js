import { NextResponse } from 'next/server';
import { createRequire } from 'module';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const require = createRequire(import.meta.url);
const { verifyAdminRequest } = require('../../../api/_firebaseAdmin');

function buildCorsHeaders(request) {
    return {
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Origin': request.headers.get('origin') || '*',
        Vary: 'Origin',
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    };
}

export async function OPTIONS(request) {
    return new NextResponse(null, {
        status: 200,
        headers: buildCorsHeaders(request)
    });
}

export async function GET(request) {
    const headers = buildCorsHeaders(request);
    const upstreamUrl = process.env.LOCAL_SERVER_STATUS_URL;

    if (!upstreamUrl) {
        return NextResponse.json(
            { error: 'LOCAL_SERVER_STATUS_URL is not configured' },
            { status: 503, headers }
        );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
        await verifyAdminRequest({
            headers: {
                authorization: request.headers.get('authorization') || ''
            }
        });

        const response = await fetch(upstreamUrl, {
            method: 'GET',
            headers: {
                Accept: 'application/json'
            },
            signal: controller.signal,
            cache: 'no-store'
        });

        const payload = await response.text();
        let parsedPayload = null;

        try {
            parsedPayload = payload ? JSON.parse(payload) : null;
        } catch {
            parsedPayload = null;
        }

        if (!response.ok) {
            return NextResponse.json(
                {
                    error: (parsedPayload && parsedPayload.error) || 'Upstream local server request failed'
                },
                { status: response.status, headers }
            );
        }

        return NextResponse.json(parsedPayload || { status: 'Operational', raw: payload }, { status: 200, headers });
    } catch (error) {
        const isAbortError = error?.name === 'AbortError';
        const status = error?.status || (isAbortError ? 504 : 500);

        return NextResponse.json(
            {
                error: isAbortError
                    ? 'Timed out while contacting the local server endpoint'
                    : (error?.message || 'Failed to reach the local server endpoint')
            },
            { status, headers }
        );
    } finally {
        clearTimeout(timeout);
    }
}