const crypto = require('crypto');
const { getAdminInitError, verifyRequestUser } = require('./_firebaseAdmin');

function setCorsHeaders(req, res) {
    const origin = req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}

module.exports = async (req, res) => {
    setCorsHeaders(req, res);

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method Not Allowed' });
        return;
    }

    try {
        await verifyRequestUser(req);

        if (!process.env.IMAGEKIT_PUBLIC_KEY || !process.env.IMAGEKIT_PRIVATE_KEY || !process.env.IMAGEKIT_URL_ENDPOINT) {
            res.status(500).json({ error: 'ImageKit environment variables are not configured' });
            return;
        }

        const token = crypto.randomUUID();
        const expire = Math.floor(Date.now() / 1000) + 600;
        const signature = crypto
            .createHmac('sha1', process.env.IMAGEKIT_PRIVATE_KEY)
            .update(`${token}${expire}`)
            .digest('hex')
            .toLowerCase();

        res.status(200).json({
            token,
            expire,
            signature,
            publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
            urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
        });
    } catch (error) {
        const initError = getAdminInitError();
        const status = error.status || 500;
        res.status(status).json({
            error: error.message || 'Failed to create ImageKit auth payload',
            details: status >= 500 && initError ? initError.message : undefined
        });
    }
};