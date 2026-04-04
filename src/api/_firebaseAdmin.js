const admin = require('firebase-admin');

let adminInitError = null;

function normalizeParsedServiceAccount(serviceAccount) {
    if (serviceAccount && typeof serviceAccount === 'object' && serviceAccount.private_key) {
        serviceAccount.private_key = String(serviceAccount.private_key).replace(/\\n/g, '\n');
    }

    return serviceAccount;
}

function escapeMultilinePrivateKey(rawValue) {
    const normalizedValue = String(rawValue || '');
    const privateKeyPattern = /("private_key"\s*:\s*")([\s\S]*?)("\s*[,}])/;

    if (!privateKeyPattern.test(normalizedValue)) {
        return normalizedValue;
    }

    return normalizedValue.replace(privateKeyPattern, (_match, prefix, privateKeyBody, suffix) => {
        const escapedBody = privateKeyBody
            .replace(/\\r/g, '\r')
            .replace(/\r\n/g, '\\n')
            .replace(/\n/g, '\\n');

        return `${prefix}${escapedBody}${suffix}`;
    });
}

function tryParseJson(rawValue) {
    const parsed = JSON.parse(String(rawValue || '').trim());

    if (typeof parsed === 'string') {
        return normalizeParsedServiceAccount(JSON.parse(parsed));
    }

    return normalizeParsedServiceAccount(parsed);
}

function parseServiceAccount(rawValue) {
    if (!rawValue) {
        const error = new Error('FIREBASE_SERVICE_ACCOUNT is not configured');
        error.status = 500;
        throw error;
    }

    const normalizedValue = String(rawValue).trim();

    try {
        return tryParseJson(normalizedValue);
    } catch (jsonError) {
        try {
            return tryParseJson(escapeMultilinePrivateKey(normalizedValue));
        } catch (_multilineJsonError) {
            try {
            const decoded = Buffer.from(normalizedValue, 'base64').toString('utf8');
                return tryParseJson(decoded);
            } catch (_base64Error) {
                try {
                    const decoded = Buffer.from(normalizedValue, 'base64').toString('utf8');
                    return tryParseJson(escapeMultilinePrivateKey(decoded));
                } catch (_sanitizedBase64Error) {
                    const error = new Error(`Invalid FIREBASE_SERVICE_ACCOUNT value: ${jsonError.message}`);
                    error.status = 500;
                    throw error;
                }
            }
        }
    }
}

function getAdmin() {
    if (!admin.apps.length) {
        try {
            const serviceAccount = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            adminInitError = null;
        } catch (error) {
            adminInitError = error;
            throw error;
        }
    }

    return admin;
}

function getDb() {
    return getAdmin().firestore();
}

function getAdminInitError() {
    return adminInitError;
}

async function verifyRequestUser(req) {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
        const error = new Error('Unauthorized');
        error.status = 401;
        throw error;
    }

    const idToken = authHeader.slice('Bearer '.length).trim();
    if (!idToken) {
        const error = new Error('Unauthorized');
        error.status = 401;
        throw error;
    }

    return getAdmin().auth().verifyIdToken(idToken);
}

async function verifyAdminRequest(req) {
    const tokenData = await verifyRequestUser(req);
    const userSnap = await getDb().collection('users').doc(tokenData.uid).get();
    const role = userSnap.exists ? userSnap.data().role : '';

    if (role !== 'admin') {
        const error = new Error('Admin access is required');
        error.status = 403;
        throw error;
    }

    return tokenData;
}

module.exports = {
    admin,
    getAdmin,
    getDb,
    getAdminInitError,
    verifyRequestUser,
    verifyAdminRequest
};