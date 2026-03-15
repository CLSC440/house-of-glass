const admin = require('firebase-admin');

let adminInitError = null;

function parseServiceAccount(rawValue) {
    if (!rawValue) {
        const error = new Error('FIREBASE_SERVICE_ACCOUNT is not configured');
        error.status = 500;
        throw error;
    }

    try {
        const parsed = JSON.parse(rawValue);
        if (parsed.private_key) {
            parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
        }
        return parsed;
    } catch (jsonError) {
        try {
            const decoded = Buffer.from(rawValue, 'base64').toString('utf8');
            const parsed = JSON.parse(decoded);
            if (parsed.private_key) {
                parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
            }
            return parsed;
        } catch (_base64Error) {
            const error = new Error(`Invalid FIREBASE_SERVICE_ACCOUNT value: ${jsonError.message}`);
            error.status = 500;
            throw error;
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

module.exports = {
    admin,
    getAdmin,
    getDb,
    getAdminInitError,
    verifyRequestUser
};