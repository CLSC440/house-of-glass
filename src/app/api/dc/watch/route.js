import crypto from 'node:crypto';

const DEFAULT_DC_PRODUCTS_URL = 'https://glass-system-backend.onrender.com/public/products';
const DEFAULT_DC_STOCK_URL = 'https://glass-system-backend.onrender.com/public/stock';
const WATCH_POLL_INTERVAL_MS = 5000;
const WATCH_HEARTBEAT_INTERVAL_MS = 25000;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const encoder = new TextEncoder();

function isLocalRuntimeHost(hostname = '') {
    return ['localhost', '127.0.0.1', '::1'].includes(String(hostname || '').trim().toLowerCase());
}

function shouldServeDcWatchStream(request) {
    const explicitFlag = String(
        process.env.ENABLE_DC_WATCH_STREAM || process.env.NEXT_PUBLIC_ENABLE_DC_WATCH_STREAM || ''
    ).trim().toLowerCase();

    if (explicitFlag === 'true') {
        return true;
    }

    if (process.env.NODE_ENV !== 'production') {
        return true;
    }

    return isLocalRuntimeHost(request.nextUrl?.hostname || '');
}

const watcherState = {
    clients: new Set(),
    lastSignature: '',
    pollTimer: null,
    heartbeatTimer: null,
    isPolling: false
};

function buildSsePayload(eventName, payload) {
    return encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function broadcast(eventName, payload) {
    const message = buildSsePayload(eventName, payload);
    watcherState.clients.forEach((sendMessage) => {
        try {
            sendMessage(message);
        } catch (_error) {
            watcherState.clients.delete(sendMessage);
        }
    });

    if (watcherState.clients.size === 0) {
        stopWatcher();
    }
}

async function fetchDcFeedText(url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            signal: controller.signal,
            cache: 'no-store'
        });

        if (!response.ok) {
            throw new Error(`DC feed request failed with ${response.status}`);
        }

        return await response.text();
    } finally {
        clearTimeout(timeoutId);
    }
}

async function getDcCatalogSignature() {
    const productsUrl = process.env.DC_PUBLIC_PRODUCTS_URL || DEFAULT_DC_PRODUCTS_URL;
    const stockUrl = process.env.DC_PUBLIC_STOCK_URL || DEFAULT_DC_STOCK_URL;
    const [productsText, stockText] = await Promise.all([
        fetchDcFeedText(productsUrl),
        fetchDcFeedText(stockUrl)
    ]);

    return crypto
        .createHash('sha1')
        .update(productsText)
        .update('::')
        .update(stockText)
        .digest('hex');
}

async function pollWatcher() {
    if (watcherState.isPolling || watcherState.clients.size === 0) {
        return;
    }

    watcherState.isPolling = true;

    try {
        const nextSignature = await getDcCatalogSignature();
        const checkedAt = Date.now();

        if (!watcherState.lastSignature) {
            watcherState.lastSignature = nextSignature;
            broadcast('ready', { checkedAt, signature: nextSignature });
            return;
        }

        if (nextSignature !== watcherState.lastSignature) {
            watcherState.lastSignature = nextSignature;
            broadcast('catalog-change', { checkedAt, signature: nextSignature });
        }
    } catch (error) {
        broadcast('watch-error', {
            checkedAt: Date.now(),
            message: error?.message || 'Failed to watch DC catalog'
        });
    } finally {
        watcherState.isPolling = false;
    }
}

function startWatcher() {
    if (!watcherState.pollTimer) {
        watcherState.pollTimer = setInterval(pollWatcher, WATCH_POLL_INTERVAL_MS);
        pollWatcher();
    }

    if (!watcherState.heartbeatTimer) {
        watcherState.heartbeatTimer = setInterval(() => {
            broadcast('heartbeat', { checkedAt: Date.now() });
        }, WATCH_HEARTBEAT_INTERVAL_MS);
    }
}

function stopWatcher() {
    if (watcherState.pollTimer) {
        clearInterval(watcherState.pollTimer);
        watcherState.pollTimer = null;
    }

    if (watcherState.heartbeatTimer) {
        clearInterval(watcherState.heartbeatTimer);
        watcherState.heartbeatTimer = null;
    }

    watcherState.isPolling = false;
}

export async function GET(request) {
    if (!shouldServeDcWatchStream(request)) {
        return new Response(null, {
            status: 204,
            headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
            }
        });
    }

    const stream = new ReadableStream({
        start(controller) {
            const sendMessage = (payload) => controller.enqueue(payload);
            watcherState.clients.add(sendMessage);

            sendMessage(buildSsePayload('connected', { checkedAt: Date.now() }));
            if (watcherState.lastSignature) {
                sendMessage(buildSsePayload('ready', { checkedAt: Date.now(), signature: watcherState.lastSignature }));
            }

            startWatcher();

            const abortHandler = () => {
                watcherState.clients.delete(sendMessage);
                controller.close();
                if (watcherState.clients.size === 0) {
                    stopWatcher();
                }
            };

            request.signal.addEventListener('abort', abortHandler, { once: true });
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive'
        }
    });
}