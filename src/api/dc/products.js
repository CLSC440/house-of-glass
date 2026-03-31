const DEFAULT_DC_PRODUCTS_URL = 'https://glass-system-backend.onrender.com/public/products';

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const upstreamUrl = process.env.DC_PUBLIC_PRODUCTS_URL || DEFAULT_DC_PRODUCTS_URL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(upstreamUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      },
      signal: controller.signal
    });

    const payload = await response.text();
    let parsed = null;

    try {
      parsed = payload ? JSON.parse(payload) : [];
    } catch (_error) {
      parsed = null;
    }

    if (!response.ok) {
      res.status(response.status).json({
        error: (parsed && parsed.error) || 'Failed to fetch DC products feed'
      });
      return;
    }

    res.status(200).json(parsed || []);
  } catch (error) {
    const isAbort = error && error.name === 'AbortError';
    res.status(504).json({
      error: isAbort
        ? 'Timed out while fetching DC products feed'
        : (error.message || 'Failed to fetch DC products feed')
    });
  } finally {
    clearTimeout(timeout);
  }
};