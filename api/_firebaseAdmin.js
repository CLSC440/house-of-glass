const admin = require('firebase-admin');

function initFirebaseAdmin() {
    if (!admin.apps.length) {
        if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
            throw new Error('FIREBASE_SERVICE_ACCOUNT is not configured');
        }

        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    }

    return admin;
}

const firebaseAdmin = initFirebaseAdmin();
const db = firebaseAdmin.firestore();

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

    return firebaseAdmin.auth().verifyIdToken(idToken);
}

module.exports = {
    admin: firebaseAdmin,
    db,
    verifyRequestUser
};