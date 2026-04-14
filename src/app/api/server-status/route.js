import { NextResponse } from 'next/server';
import { createRequire } from 'module';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const require = createRequire(import.meta.url);
const { Client } = require('pg');
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

function resolveSslConfig() {
    const sslMode = String(process.env.SERVER_STATUS_DATABASE_SSL || '').trim().toLowerCase();
    const useSsl = sslMode === 'true' || sslMode === 'require';

    return useSsl
        ? {
            ssl: { rejectUnauthorized: false }
        }
        : {};
}

function resolveConnectionStrings() {
    const primary = process.env.SERVER_STATUS_DATABASE_PRIMARY_URL || process.env.SERVER_STATUS_DATABASE_URL;
    const fallback = process.env.SERVER_STATUS_DATABASE_FALLBACK_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL;

    const candidates = [primary, fallback]
        .map((value) => String(value || '').trim())
        .filter(Boolean);

    const uniqueCandidates = Array.from(new Set(candidates));
    if (uniqueCandidates.length === 0) {
        const error = new Error('Server status database is not configured');
        error.status = 500;
        throw error;
    }

    return uniqueCandidates;
}

async function queryLatestMetrics(connectionString) {
    const client = new Client({
        connectionString,
        connectionTimeoutMillis: 5000,
        ...resolveSslConfig()
    });

    try {
        await client.connect();
        return await client.query('SELECT * FROM public.server_metrics ORDER BY id DESC LIMIT 1;');
    } finally {
        await client.end().catch(() => {});
    }
}

export async function OPTIONS(request) {
    return new NextResponse(null, {
        status: 200,
        headers: buildCorsHeaders(request)
    });
}

export async function GET(request) {
    const headers = buildCorsHeaders(request);

    try {
        await verifyAdminRequest({
            headers: {
                authorization: request.headers.get('authorization') || ''
            }
        });

        const connectionStrings = resolveConnectionStrings();
        let result = null;
        let lastError = null;

        for (const connectionString of connectionStrings) {
            try {
                result = await queryLatestMetrics(connectionString);
                lastError = null;
                break;
            } catch (error) {
                lastError = error;
            }
        }

        if (!result) {
            throw lastError || new Error('Failed to connect');
        }

        if (result.rows.length > 0) {
            return NextResponse.json(result.rows[0], { status: 200, headers });
        }

        return NextResponse.json({ error: 'No data found' }, { status: 404, headers });
    } catch (error) {
        console.error('Database connection error:', error);
        return NextResponse.json(
            { error: error?.message || 'Failed to connect' },
            { status: error?.status || 500, headers }
        );
    }
}