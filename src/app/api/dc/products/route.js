import { NextResponse } from 'next/server';

const DEFAULT_DC_PRODUCTS_URL = 'https://glass-system-backend.onrender.com/public/products';
const DC_CACHE_REVALIDATE_SECONDS = 30;
const DC_CACHE_STALE_SECONDS = 120;

export const dynamic = 'auto';

function shouldBypassDcCache(request) {
  const { searchParams } = new URL(request.url);
  return ['refresh', 'watch', 'admin_live'].some((key) => searchParams.has(key));
}

function buildDcCacheHeaders(bypassCache) {
  return {
    'Cache-Control': bypassCache
      ? 'no-store, no-cache, must-revalidate, proxy-revalidate'
      : `public, max-age=0, s-maxage=${DC_CACHE_REVALIDATE_SECONDS}, stale-while-revalidate=${DC_CACHE_STALE_SECONDS}`
  };
}

export async function GET(request) {
  const upstreamUrl = process.env.DC_PUBLIC_PRODUCTS_URL || DEFAULT_DC_PRODUCTS_URL;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  const bypassCache = shouldBypassDcCache(request);

  try {
    const response = await fetch(upstreamUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      },
      signal: controller.signal,
      cache: bypassCache ? 'no-store' : 'force-cache',
      next: bypassCache ? { revalidate: 0 } : { revalidate: DC_CACHE_REVALIDATE_SECONDS }
    });

    const payload = await response.text();
    let parsed = null;

    try {
      parsed = payload ? JSON.parse(payload) : [];
    } catch (_error) {
      parsed = null;
    }

    if (!response.ok) {
      return NextResponse.json({
        error: (parsed && parsed.error) || 'Failed to fetch DC products feed'
      }, { status: response.status });
    }

    return NextResponse.json(parsed || [], {
      headers: buildDcCacheHeaders(bypassCache)
    });
  } catch (error) {
    const isAbort = error && error.name === 'AbortError';
    return NextResponse.json({
      error: isAbort
        ? 'Timed out while fetching DC products feed'
        : (error.message || 'Failed to fetch DC products feed')
    }, {
      status: 504,
      headers: buildDcCacheHeaders(true)
    });
  } finally {
    clearTimeout(timeoutId);
  }
}