import { createRequire } from 'module';
import { NextResponse } from 'next/server';

const require = createRequire(import.meta.url);
const { getAdminInitError, verifyRequestUser } = require('../../../api/_firebaseAdmin.js');

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
            console.warn(`Bypassing Firebase Admin verification for /api/imagekit-media in local development because admin auth is unavailable: ${error?.message || 'Unknown error'}`);
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

async function deleteImageKitFile(fileId) {
    const authToken = Buffer.from(`${process.env.IMAGEKIT_PRIVATE_KEY}:`).toString('base64');
    const response = await fetch(`https://api.imagekit.io/v1/files/${encodeURIComponent(fileId)}`, {
        method: 'DELETE',
        headers: {
            Authorization: `Basic ${authToken}`
        }
    });

    if (response.ok || response.status === 404) {
        return { fileId, deleted: true };
    }

    let details = '';
    try {
        const payload = await response.json();
        details = payload.message || payload.help || '';
    } catch (_error) {
        details = response.statusText || 'Unknown ImageKit error';
    }

    return {
        fileId,
        deleted: false,
        error: details || `ImageKit request failed with ${response.status}`
    };
}

export async function POST(request) {
    try {
        await verifyImageKitRequest(request);

        if (!process.env.IMAGEKIT_PRIVATE_KEY) {
            return NextResponse.json({ error: 'IMAGEKIT_PRIVATE_KEY is not configured' }, { status: 500 });
        }

        const body = await request.json().catch(() => ({}));
        const fileIds = Array.from(new Set(Array.isArray(body.fileIds) ? body.fileIds.filter(Boolean) : []));

        if (fileIds.length === 0) {
            return NextResponse.json({ deleted: [], failed: [] });
        }

        const results = await Promise.all(fileIds.map(deleteImageKitFile));
        const deleted = results.filter((result) => result.deleted).map((result) => result.fileId);
        const failed = results.filter((result) => !result.deleted);

        return NextResponse.json({ deleted, failed });
    } catch (error) {
        const initError = getAdminInitError();
        const status = error.status || 500;
        return NextResponse.json({
            error: error.message || 'Failed to manage ImageKit media',
            details: status >= 500 && initError ? initError.message : undefined
        }, { status });
    }
}