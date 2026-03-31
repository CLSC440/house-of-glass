async function callAccountApi(action, payload = {}, idToken = null) {
    const headers = {
        'Content-Type': 'application/json'
    };

    if (idToken) {
        headers.Authorization = `Bearer ${idToken}`;
    }

    const response = await fetch('/api/user-account', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action, ...payload })
    });

    const responseData = await response.json().catch(() => ({}));
    if (!response.ok || responseData?.success === false) {
        throw new Error(responseData?.error || responseData?.message || 'Request failed');
    }

    return responseData;
}

export async function resolveLoginIdentifier(identifier) {
    const responseData = await callAccountApi('resolveIdentifier', { identifier });
    return responseData.email || '';
}

export async function checkAccountAvailability({ username = '', phone = '' } = {}) {
    return callAccountApi('checkAvailability', { username, phone });
}

export async function upsertCurrentUserProfile(currentUser, profile = {}, options = {}) {
    if (!currentUser) {
        throw new Error('Authentication required');
    }

    const idToken = await currentUser.getIdToken();
    return callAccountApi('upsertProfile', { profile, options }, idToken);
}

export async function deleteOwnAccount(currentUser) {
    if (!currentUser) {
        throw new Error('Authentication required');
    }

    const idToken = await currentUser.getIdToken();
    return callAccountApi('deleteOwnAccount', {}, idToken);
}

export async function adminDeleteUserAccount(currentUser, uid) {
    if (!currentUser) {
        throw new Error('Authentication required');
    }

    const idToken = await currentUser.getIdToken();
    return callAccountApi('adminDeleteUser', { uid }, idToken);
}

export async function adminUpdateUserRole(currentUser, uid, role) {
    if (!currentUser) {
        throw new Error('Authentication required');
    }

    const idToken = await currentUser.getIdToken();
    return callAccountApi('adminUpdateUserRole', { uid, role }, idToken);
}