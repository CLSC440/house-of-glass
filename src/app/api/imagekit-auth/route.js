import crypto from 'node:crypto';
import { createRequire } from 'module';
import { NextResponse } from 'next/server';

const require = createRequire(import.meta.url);
const { getAdminInitError, verifyRequestUser } = require('../../../api/_firebaseAdmin.js');

export const dynamic = 'force-dynamic';

function isLocalDevelopmentRequest(request) {
    if (process.env.NODE_ENV === 'production') return false;

    const host = String(request.headers.get('host') || '').toLowerCase();
    const origin = String(request.headers.get('origin') || '').toLowerCase();
    return host.includes('localhost') || host.includes('127.0.0.1') || origin.includes('localhost') || origin.includes('127.0.0.1');
}

async function verifyImageKitRequest(request) {
    try {
        await verifyRequestUser(buildRequestShim(request));
    } catch (error) {
        if (isLocalDevelopmentRequest(request)) {
            console.warn(`Bypassing Firebase Admin verification for /api/imagekit-auth in local development because admin auth is unavailable: ${error?.message || 'Unknown error'}`);
            return;
        }

        throw error;
    }
}

function buildRequestShim(request) {
    return {
        headers: {
            authorization: request.headers.get('authorization') || ''
        }
    };
}

export async function GET(request) {
    try {
        await verifyImageKitRequest(request);

        if (!process.env.IMAGEKIT_PUBLIC_KEY || !process.env.IMAGEKIT_PRIVATE_KEY || !process.env.IMAGEKIT_URL_ENDPOINT) {
            return NextResponse.json({ error: 'ImageKit environment variables are not configured' }, { status: 500 });
        }

        const token = crypto.randomUUID();
        const expire = Math.floor(Date.now() / 1000) + 600;
        const signature = crypto
            .createHmac('sha1', process.env.IMAGEKIT_PRIVATE_KEY)
            .update(`${token}${expire}`)
            .digest('hex')
            .toLowerCase();

        return NextResponse.json({
            token,
            expire,
            signature,
            publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
            urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
        }, {
            headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
                Pragma: 'no-cache',
                Expires: '0'
            }
        });
    } catch (error) {
        const initError = getAdminInitError();
        const status = error.status || 500;
        return NextResponse.json({
            error: error.message || 'Failed to create ImageKit auth payload',
            details: status >= 500 && initError ? initError.message : undefined
        }, {
            status,
            headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
                Pragma: 'no-cache',
                Expires: '0'
            }
        });
    }
}