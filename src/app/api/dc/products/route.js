import { NextResponse } from 'next/server';

const DEFAULT_DC_PRODUCTS_URL = 'https://glass-system-backend.onrender.com/public/products';

export async function GET() {
  const upstreamUrl = process.env.DC_PUBLIC_PRODUCTS_URL || DEFAULT_DC_PRODUCTS_URL;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(upstreamUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      },
      signal: controller.signal,
      next: { revalidate: 60 }
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

    return NextResponse.json(parsed || []);
  } catch (error) {
    const isAbort = error && error.name === 'AbortError';
    return NextResponse.json({
      error: isAbort
        ? 'Timed out while fetching DC products feed'
        : (error.message || 'Failed to fetch DC products feed')
    }, { status: 504 });
  } finally {
    clearTimeout(timeoutId);
  }
}