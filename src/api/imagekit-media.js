const { getDb, getAdminInitError, verifyRequestUser } = require('./_firebaseAdmin');

function setCorsHeaders(req, res) {
    const origin = req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}

function parseRequestBody(req) {
    if (!req.body) return {};
    if (typeof req.body === 'string') {
        try {
            return JSON.parse(req.body);
        } catch (_error) {
            return {};
        }
    }
    return req.body;
}

async function ensureStaffUser(req) {
    const decodedToken = await verifyRequestUser(req);
    const userDoc = await getDb().collection('users').doc(decodedToken.uid).get();
    const role = userDoc.exists ? userDoc.data()?.role : null;

    if (role !== 'admin' && role !== 'moderator') {
        const error = new Error('Forbidden');
        error.status = 403;
        throw error;
    }

    return decodedToken;
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

module.exports = async (req, res) => {
    setCorsHeaders(req, res);

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method Not Allowed' });
        return;
    }

    try {
        await ensureStaffUser(req);

        if (!process.env.IMAGEKIT_PRIVATE_KEY) {
            res.status(500).json({ error: 'IMAGEKIT_PRIVATE_KEY is not configured' });
            return;
        }

        const body = parseRequestBody(req);
        const fileIds = Array.from(new Set(Array.isArray(body.fileIds) ? body.fileIds.filter(Boolean) : []));

        if (fileIds.length === 0) {
            res.status(200).json({ deleted: [], failed: [] });
            return;
        }

        const results = await Promise.all(fileIds.map(deleteImageKitFile));
        const deleted = results.filter((result) => result.deleted).map((result) => result.fileId);
        const failed = results.filter((result) => !result.deleted);

        res.status(200).json({ deleted, failed });
    } catch (error) {
        const initError = getAdminInitError();
        const status = error.status || 500;
        res.status(status).json({
            error: error.message || 'Failed to manage ImageKit media',
            details: status >= 500 && initError ? initError.message : undefined
        });
    }
};