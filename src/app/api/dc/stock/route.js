import { NextResponse } from 'next/server';

const DEFAULT_DC_STOCK_URL = 'https://glass-system-backend.onrender.com/public/stock';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const upstreamUrl = process.env.DC_PUBLIC_STOCK_URL || DEFAULT_DC_STOCK_URL;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(upstreamUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      },
      signal: controller.signal,
      cache: 'no-store'
    });

    const payload = await response.text();
    let parsed = null;

    try {
      parsed = payload ? JSON.parse(payload) : {};
    } catch (_error) {
      parsed = null;
    }

    if (!response.ok) {
      return NextResponse.json({
        error: (parsed && parsed.error) || 'Failed to fetch DC stock feed'
      }, { status: response.status });
    }

    return NextResponse.json(parsed || {}, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
      }
    });
  } catch (error) {
    const isAbort = error && error.name === 'AbortError';
    return NextResponse.json({
      error: isAbort
        ? 'Timed out while fetching DC stock feed'
        : (error.message || 'Failed to fetch DC stock feed')
    }, { status: 504 });
  } finally {
    clearTimeout(timeoutId);
  }
}
