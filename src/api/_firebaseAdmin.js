const admin = require('firebase-admin');

let adminInitError = null;

const ROLE_PERMISSION_KEYS = Object.freeze({
    ACCESS_ADMIN: 'accessAdmin',
    VIEW_DASHBOARD: 'viewDashboard',
    VIEW_PRODUCTS: 'viewProducts',
    VIEW_STOCK: 'viewStock',
    VIEW_ORDERS: 'viewOrders',
    VIEW_USERS: 'viewUsers',
    MANAGE_USERS: 'manageUsers',
    VIEW_ROLES: 'viewRoles',
    MANAGE_ROLES: 'manageRoles'
});

const DEFAULT_ROLE_PERMISSIONS = Object.freeze({
    accessAdmin: false,
    viewDashboard: false,
    viewProducts: false,
    viewStock: false,
    viewOrders: false,
    viewUsers: false,
    manageUsers: false,
    viewRoles: false,
    manageRoles: false
});

function normalizeRoleKey(role) {
    const normalized = String(role || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 48);

    if (!normalized) return 'customer';
    if (normalized === 'customer' || normalized === 'user' || normalized === 'retail' || normalized === 'cst_retail') return 'customer';
    if (normalized === 'wholesale' || normalized === 'cst_wholesale') return 'cst_wholesale';
    return normalized;
}

function normalizeRolePermissions(permissions = {}) {
    return Object.keys(DEFAULT_ROLE_PERMISSIONS).reduce((result, permissionKey) => {
        result[permissionKey] = permissions?.[permissionKey] === true;
        return result;
    }, { ...DEFAULT_ROLE_PERMISSIONS });
}

function getSystemRolePermissions(role) {
    const normalizedRole = normalizeRoleKey(role);

    if (normalizedRole === 'admin') {
        return normalizeRolePermissions({
            accessAdmin: true,
            viewDashboard: true,
            viewProducts: true,
            viewStock: true,
            viewOrders: true,
            viewUsers: true,
            manageUsers: true,
            viewRoles: true,
            manageRoles: true
        });
    }

    if (normalizedRole === 'moderator') {
        return normalizeRolePermissions({
            accessAdmin: true,
            viewDashboard: true,
            viewProducts: true,
            viewStock: true,
            viewOrders: true,
            viewUsers: true
        });
    }

    return normalizeRolePermissions();
}

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

async function resolveRolePermissions(role) {
    const normalizedRole = normalizeRoleKey(role);
    const systemPermissions = getSystemRolePermissions(normalizedRole);

    if (normalizedRole === 'admin' || normalizedRole === 'moderator' || normalizedRole === 'customer' || normalizedRole === 'cst_wholesale') {
        return systemPermissions;
    }

    const roleSnap = await getDb().collection('roles').doc(normalizedRole).get();
    if (!roleSnap.exists) {
        return systemPermissions;
    }

    return {
        ...systemPermissions,
        ...normalizeRolePermissions(roleSnap.data()?.permissions)
    };
}

async function getUserRoleContext(uid) {
    const userSnap = await getDb().collection('users').doc(uid).get();
    const userData = userSnap.exists ? userSnap.data() : {};
    const role = normalizeRoleKey(userData?.role);
    const permissions = await resolveRolePermissions(role);

    return {
        uid,
        role,
        permissions,
        userData
    };
}

async function userHasRolePermission(uid, permissionKey) {
    const roleContext = await getUserRoleContext(uid);
    return roleContext.permissions?.[permissionKey] === true;
}

async function requireUserRolePermission(uid, permissionKey, message = 'Forbidden') {
    const roleContext = await getUserRoleContext(uid);
    if (roleContext.permissions?.[permissionKey] !== true) {
        const error = new Error(message);
        error.status = 403;
        throw error;
    }

    return roleContext;
}

async function requireRequestPermission(req, permissionKey, message = 'Forbidden') {
    const tokenData = await verifyRequestUser(req);
    const roleContext = await requireUserRolePermission(tokenData.uid, permissionKey, message);
    return {
        tokenData,
        ...roleContext
    };
}

async function listUsersWithRolePermission(permissionKey) {
    const db = getDb();
    const [usersSnap, rolesSnap] = await Promise.all([
        db.collection('users').get(),
        db.collection('roles').get()
    ]);
    const customRolePermissions = new Map();

    rolesSnap.forEach((roleDoc) => {
        customRolePermissions.set(normalizeRoleKey(roleDoc.id), normalizeRolePermissions(roleDoc.data()?.permissions));
    });

    return usersSnap.docs
        .map((userDoc) => ({ id: userDoc.id, ...userDoc.data() }))
        .filter((userData) => {
            const role = normalizeRoleKey(userData?.role);
            const systemPermissions = getSystemRolePermissions(role);
            if (systemPermissions?.[permissionKey] === true) {
                return true;
            }

            return customRolePermissions.get(role)?.[permissionKey] === true;
        });
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
    verifyAdminRequest,
    ROLE_PERMISSION_KEYS,
    getUserRoleContext,
    userHasRolePermission,
    requireUserRolePermission,
    requireRequestPermission,
    listUsersWithRolePermission
};