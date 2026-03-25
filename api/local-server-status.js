module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const upstreamUrl = process.env.LOCAL_SERVER_STATUS_URL;

  if (!upstreamUrl) {
    res.status(503).json({ error: 'LOCAL_SERVER_STATUS_URL is not configured' });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

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
      parsed = payload ? JSON.parse(payload) : null;
    } catch (_error) {
      parsed = null;
    }

    if (!response.ok) {
      res.status(response.status).json({
        error: (parsed && parsed.error) || 'Upstream local server request failed'
      });
      return;
    }

    res.status(200).json(parsed || { status: 'Operational', raw: payload });
  } catch (error) {
    const isAbort = error && error.name === 'AbortError';
    res.status(504).json({
      error: isAbort
        ? 'Timed out while contacting the local server endpoint'
        : (error.message || 'Failed to reach the local server endpoint')
    });
  } finally {
    clearTimeout(timeout);
  }
};