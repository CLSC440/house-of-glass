import { NextResponse } from 'next/server';
import { createRequire } from 'module';
import { normalizeUserRole } from '@/lib/user-roles';

const require = createRequire(import.meta.url);
const { admin, getDb, verifyRequestUser } = require('../../../api/_firebaseAdmin.js');

const ALLOWED_ROLES = new Set(['customer', 'cst_wholesale', 'moderator', 'admin']);

function createError(status, message) {
    const error = new Error(message);
    error.status = status;
    return error;
}

function normalizeString(value, maxLength = 200) {
    return String(value || '').trim().slice(0, maxLength);
}

function normalizeEmail(value) {
    return normalizeString(value, 254).toLowerCase();
}

function normalizeUsername(value) {
    return normalizeString(value, 32).toLowerCase().replace(/\s+/g, '');
}

function normalizePhone(value) {
    const trimmed = normalizeString(value, 32);
    if (!trimmed) return '';

    const digits = trimmed.replace(/\D/g, '');
    if (/^01[0125]\d{8}$/.test(digits)) return `+20${digits.slice(1)}`;
    if (/^1[0125]\d{8}$/.test(digits)) return `+20${digits}`;
    if (/^20\d{10}$/.test(digits)) return `+${digits}`;
    if (/^\+20\d{10}$/.test(trimmed)) return trimmed;
    return trimmed;
}

function buildDisplayName({ firstName = '', lastName = '', name = '', email = '' }) {
    const joined = [normalizeString(firstName, 60), normalizeString(lastName, 60)].filter(Boolean).join(' ').trim();
    return joined || normalizeString(name, 120) || normalizeString(email, 120).split('@')[0] || 'User';
}

function sanitizeProfile(rawProfile = {}, tokenData = {}, currentProfile = {}) {
    const firstName = normalizeString(rawProfile.firstName ?? currentProfile.firstName, 60);
    const lastName = normalizeString(rawProfile.lastName ?? currentProfile.lastName, 60);
    const authEmail = normalizeEmail(tokenData.email || currentProfile.authEmail || currentProfile.email);
    const profileEmail = normalizeEmail(rawProfile.email ?? currentProfile.email);
    const name = buildDisplayName({
        firstName,
        lastName,
        name: rawProfile.name ?? currentProfile.name,
        email: profileEmail || authEmail
    });
    const username = normalizeUsername(rawProfile.username ?? currentProfile.username);
    const phone = normalizePhone(rawProfile.phone ?? currentProfile.phone);
    const photoURL = normalizeString(rawProfile.photoURL ?? currentProfile.photoURL, 2048);

    return {
        uid: tokenData.uid || currentProfile.uid,
        username,
        usernameLowercase: username,
        firstName,
        lastName,
        name,
        email: profileEmail,
        emailLowercase: profileEmail,
        authEmail,
        authEmailLowercase: authEmail,
        phone,
        photoURL,
        photoMeta: rawProfile.photoMeta && typeof rawProfile.photoMeta === 'object' ? rawProfile.photoMeta : (currentProfile.photoMeta || null),
        favorites: Array.isArray(currentProfile.favorites) ? currentProfile.favorites : []
    };
}

function makeDirectoryId(type, value) {
    return `${type}:${value}`;
}

async function findUserByUsername(db, identifier) {
    const normalized = normalizeUsername(identifier);
    if (!normalized) return null;

    let snapshot = await db.collection('users').where('usernameLowercase', '==', normalized).limit(1).get();
    if (!snapshot.empty) {
        return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
    }

    snapshot = await db.collection('users').where('username', '==', normalizeString(identifier, 32)).limit(1).get();
    if (!snapshot.empty) {
        return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
    }

    return null;
}

async function findUserByPhone(db, phone) {
    const normalized = normalizePhone(phone);
    if (!normalized) return null;

    const snapshot = await db.collection('users').where('phone', '==', normalized).limit(1).get();
    if (snapshot.empty) return null;
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
}

async function findUserByEmail(db, email) {
    const normalized = normalizeEmail(email);
    if (!normalized) return null;

    let snapshot = await db.collection('users').where('authEmailLowercase', '==', normalized).limit(1).get();
    if (!snapshot.empty) return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };

    snapshot = await db.collection('users').where('authEmail', '==', normalized).limit(1).get();
    if (!snapshot.empty) return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };

    snapshot = await db.collection('users').where('emailLowercase', '==', normalized).limit(1).get();
    if (!snapshot.empty) return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };

    snapshot = await db.collection('users').where('email', '==', normalized).limit(1).get();
    if (snapshot.empty) return null;
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
}

async function findExistingOwner(db, type, value) {
    if (!value) return null;

    const directorySnap = await db.collection('user_directory').doc(makeDirectoryId(type, value)).get();
    if (directorySnap.exists) {
        return directorySnap.data().uid || null;
    }

    if (type === 'username') return (await findUserByUsername(db, value))?.uid || (await findUserByUsername(db, value))?.id || null;
    if (type === 'phone') return (await findUserByPhone(db, value))?.uid || (await findUserByPhone(db, value))?.id || null;
    if (type === 'email') return (await findUserByEmail(db, value))?.uid || (await findUserByEmail(db, value))?.id || null;
    return null;
}

async function ensureValueAvailable(db, type, value, uid) {
    if (!value) return;
    const existingOwner = await findExistingOwner(db, type, value);
    if (existingOwner && existingOwner !== uid) {
        if (type === 'username') throw createError(409, 'Username is already taken. Please choose another one.');
        if (type === 'phone') throw createError(409, 'Phone number is already registered to another account.');
        if (type === 'email') throw createError(409, 'Email is already connected to another account.');
    }
}

async function pickAvailableUsername(db, requestedUsername, seedName, seedEmail, uid) {
    const baseSeed = normalizeUsername(requestedUsername) || normalizeUsername(seedName) || normalizeUsername(String(seedEmail || '').split('@')[0]) || `user${Date.now().toString().slice(-6)}`;
    const base = baseSeed.slice(0, 20) || 'user';

    for (let attempt = 0; attempt < 12; attempt += 1) {
        const candidate = attempt === 0 ? base : `${base.slice(0, Math.max(4, 20 - String(attempt).length - 4))}${Math.floor(1000 + Math.random() * 9000)}`;
        const owner = await findExistingOwner(db, 'username', candidate);
        if (!owner || owner === uid) return candidate;
    }

    throw createError(409, 'Unable to generate a unique username right now. Please try again.');
}

async function claimDirectoryEntries(db, transaction, uid, nextProfile, currentProfile = {}) {
    const entries = [
        { type: 'username', nextValue: nextProfile.usernameLowercase, prevValue: normalizeUsername(currentProfile.usernameLowercase || currentProfile.username) },
        { type: 'phone', nextValue: nextProfile.phone, prevValue: normalizePhone(currentProfile.phone) },
        { type: 'email', nextValue: nextProfile.authEmailLowercase, prevValue: normalizeEmail(currentProfile.authEmailLowercase || currentProfile.authEmail || currentProfile.emailLowercase || currentProfile.email) }
    ];

    for (const entry of entries) {
        if (entry.prevValue && entry.prevValue !== entry.nextValue) {
            const deleteRef = db.collection('user_directory').doc(makeDirectoryId(entry.type, entry.prevValue));
            const deleteSnap = await transaction.get(deleteRef);
            if (deleteSnap.exists && deleteSnap.data().uid === uid) {
                transaction.delete(deleteRef);
            }
        }

        if (entry.nextValue) {
            const setRef = db.collection('user_directory').doc(makeDirectoryId(entry.type, entry.nextValue));
            const setSnap = await transaction.get(setRef);
            if (setSnap.exists && setSnap.data().uid !== uid) {
                if (entry.type === 'username') throw createError(409, 'Username is already taken. Please choose another one.');
                if (entry.type === 'phone') throw createError(409, 'Phone number is already registered to another account.');
                if (entry.type === 'email') throw createError(409, 'Email is already connected to another account.');
            }

            transaction.set(setRef, {
                uid,
                type: entry.type,
                value: entry.nextValue,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        }
    }
}

async function deleteDirectoryEntriesForUser(db, batch, uid, userData = {}) {
    const entries = [
        { type: 'username', value: normalizeUsername(userData.usernameLowercase || userData.username) },
        { type: 'phone', value: normalizePhone(userData.phone) },
        { type: 'email', value: normalizeEmail(userData.authEmailLowercase || userData.authEmail || userData.emailLowercase || userData.email) }
    ].filter((entry) => entry.value);

    for (const entry of entries) {
        const ref = db.collection('user_directory').doc(makeDirectoryId(entry.type, entry.value));
        const snap = await ref.get();
        if (snap.exists && snap.data().uid === uid) batch.delete(ref);
    }
}

async function requireAdmin(db, callerUid) {
    const callerSnap = await db.collection('users').doc(callerUid).get();
    const role = normalizeUserRole(callerSnap.exists ? callerSnap.data()?.role : '');

    if (role !== 'admin') {
        throw createError(403, 'Admin access is required for this action.');
    }
}

function getAuthorizationHeader(request) {
    return request.headers.get('authorization') || '';
}

async function verifyUserFromRequest(request) {
    const authHeader = getAuthorizationHeader(request);
    return verifyRequestUser({ headers: { authorization: authHeader } });
}

export async function POST(request) {
    try {
        const db = getDb();
        const body = await request.json().catch(() => ({}));
        const action = normalizeString(body?.action, 64);

        if (action === 'resolveIdentifier') {
            const identifier = normalizeString(body?.identifier, 120);
            if (!identifier) throw createError(400, 'Identifier is required.');

            if (identifier.includes('@')) {
                return NextResponse.json({ success: true, email: normalizeEmail(identifier) });
            }

            const byPhone = await findUserByPhone(db, identifier);
            if (byPhone?.authEmail || byPhone?.email) {
                return NextResponse.json({ success: true, email: byPhone.authEmail || byPhone.email });
            }

            const byUsername = await findUserByUsername(db, identifier);
            if (byUsername?.authEmail || byUsername?.email) {
                return NextResponse.json({ success: true, email: byUsername.authEmail || byUsername.email });
            }

            return NextResponse.json({ success: false, error: 'No account matches this username or phone number.' }, { status: 404 });
        }

        if (action === 'checkAvailability') {
            const username = normalizeUsername(body?.username);
            const phone = normalizePhone(body?.phone);
            const usernameOwner = username ? await findExistingOwner(db, 'username', username) : null;
            const phoneOwner = phone ? await findExistingOwner(db, 'phone', phone) : null;

            return NextResponse.json({
                success: true,
                username,
                phone,
                usernameAvailable: !usernameOwner,
                phoneAvailable: !phoneOwner
            });
        }

        if (action === 'upsertProfile') {
            const tokenData = await verifyUserFromRequest(request);
            const userRef = db.collection('users').doc(tokenData.uid);
            const currentSnap = await userRef.get();
            const currentProfile = currentSnap.exists ? currentSnap.data() : {};
            const options = body?.options || {};
            const nextProfile = sanitizeProfile(body?.profile || {}, tokenData, currentProfile);

            if (options.autoGenerateUsername || !nextProfile.usernameLowercase) {
                nextProfile.username = await pickAvailableUsername(db, nextProfile.username, nextProfile.name, nextProfile.authEmail || nextProfile.email, tokenData.uid);
                nextProfile.usernameLowercase = nextProfile.username;
            }

            if (!nextProfile.usernameLowercase) throw createError(400, 'Username is required.');

            await ensureValueAvailable(db, 'username', nextProfile.usernameLowercase, tokenData.uid);
            await ensureValueAvailable(db, 'phone', nextProfile.phone, tokenData.uid);
            await ensureValueAvailable(db, 'email', nextProfile.authEmailLowercase, tokenData.uid);

            const role = normalizeUserRole(currentProfile.role || 'customer');

            await db.runTransaction(async (transaction) => {
                const liveSnap = await transaction.get(userRef);
                const liveProfile = liveSnap.exists ? liveSnap.data() : {};
                const liveRole = normalizeUserRole(liveProfile.role || role || 'customer');

                if (!ALLOWED_ROLES.has(liveRole)) throw createError(400, 'Invalid role on user profile.');

                await claimDirectoryEntries(db, transaction, tokenData.uid, nextProfile, liveProfile);

                transaction.set(userRef, {
                    uid: tokenData.uid,
                    username: nextProfile.usernameLowercase,
                    usernameLowercase: nextProfile.usernameLowercase,
                    firstName: nextProfile.firstName,
                    lastName: nextProfile.lastName,
                    name: nextProfile.name,
                    email: nextProfile.emailLowercase,
                    emailLowercase: nextProfile.emailLowercase,
                    authEmail: nextProfile.authEmailLowercase,
                    authEmailLowercase: nextProfile.authEmailLowercase,
                    phone: nextProfile.phone,
                    photoURL: nextProfile.photoURL || '',
                    photoMeta: nextProfile.photoMeta || admin.firestore.FieldValue.delete(),
                    favorites: Array.isArray(liveProfile.favorites) ? liveProfile.favorites : (Array.isArray(currentProfile.favorites) ? currentProfile.favorites : []),
                    role: liveRole,
                    createdAt: liveProfile.createdAt || currentProfile.createdAt || admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            });

            const savedSnap = await userRef.get();
            return NextResponse.json({ success: true, profile: savedSnap.data() });
        }

        if (action === 'deleteOwnAccount') {
            const tokenData = await verifyUserFromRequest(request);
            const userRef = db.collection('users').doc(tokenData.uid);
            const userSnap = await userRef.get();
            const batch = db.batch();

            if (userSnap.exists) {
                await deleteDirectoryEntriesForUser(db, batch, tokenData.uid, userSnap.data());
                batch.delete(userRef);
            }

            await batch.commit();
            await admin.auth().deleteUser(tokenData.uid);
            return NextResponse.json({ success: true });
        }

        if (action === 'adminDeleteUser') {
            const tokenData = await verifyUserFromRequest(request);
            await requireAdmin(db, tokenData.uid);

            const uid = normalizeString(body?.uid, 128);
            if (!uid) throw createError(400, 'uid is required.');

            const userRef = db.collection('users').doc(uid);
            const userSnap = await userRef.get();
            const batch = db.batch();

            if (userSnap.exists) {
                await deleteDirectoryEntriesForUser(db, batch, uid, userSnap.data());
                batch.delete(userRef);
            }

            await batch.commit();

            try {
                await admin.auth().deleteUser(uid);
            } catch (error) {
                if (error.code !== 'auth/user-not-found') {
                    throw error;
                }
            }

            return NextResponse.json({ success: true });
        }

        if (action === 'adminUpdateUserRole') {
            const tokenData = await verifyUserFromRequest(request);
            await requireAdmin(db, tokenData.uid);

            const uid = normalizeString(body?.uid, 128);
            const role = normalizeUserRole(body?.role);

            if (!uid) throw createError(400, 'uid is required.');
            if (!ALLOWED_ROLES.has(role)) throw createError(400, 'Invalid role provided.');

            await db.collection('users').doc(uid).set({
                role,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            return NextResponse.json({ success: true, role });
        }

        throw createError(400, 'Unsupported action.');
    } catch (error) {
        return NextResponse.json({ success: false, error: error.message || 'Unexpected server error' }, { status: error.status || 500 });
    }
}

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 200,
        headers: {
            'Access-Control-Allow-Credentials': 'true',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST,OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        }
    });
}