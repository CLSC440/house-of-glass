const { Client } = require('pg');

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
    const result = await client.query('SELECT * FROM public.server_metrics ORDER BY id DESC LIMIT 1;');
    return result;
  } finally {
    await client.end().catch(() => {});
  }
}

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

  try {
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
      res.status(200).json(result.rows[0]);
    } else {
      res.status(404).json({ error: 'No data found' });
    }
  } catch (err) {
    console.error('Database connection error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to connect' });
  }
};